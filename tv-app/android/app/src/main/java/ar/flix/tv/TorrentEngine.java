package ar.flix.tv;

import java.io.File;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.logging.Level;
import java.util.logging.Logger;
import org.libtorrent4j.AlertListener;
import org.libtorrent4j.AnnounceEntry;
import org.libtorrent4j.FileStorage;
import org.libtorrent4j.Priority;
import org.libtorrent4j.SessionHandle;
import org.libtorrent4j.SessionManager;
import org.libtorrent4j.SessionParams;
import org.libtorrent4j.SettingsPack;
import org.libtorrent4j.TcpEndpoint;
import org.libtorrent4j.TorrentFlags;
import org.libtorrent4j.TorrentHandle;
import org.libtorrent4j.TorrentInfo;
import org.libtorrent4j.TorrentStatus;
import org.libtorrent4j.alerts.Alert;
import org.libtorrent4j.alerts.AlertType;
import org.libtorrent4j.alerts.CacheFlushedAlert;
import org.libtorrent4j.alerts.PieceFinishedAlert;
import org.libtorrent4j.alerts.TorrentAlert;
import org.libtorrent4j.swig.add_torrent_params;
import org.libtorrent4j.swig.error_code;
import org.libtorrent4j.swig.libtorrent;
import org.libtorrent4j.swig.settings_pack;
import org.libtorrent4j.swig.torrent_flags_t;
import org.libtorrent4j.swig.torrent_handle;

/**
 * Motor de torrents (v0.25): baja de a pedazos lo que el reproductor va pidiendo, como el servidor
 * de Stremio. Es Java puro (nada de android.*) así se prueba en la JVM; lo de Android (carpeta de
 * caché, ciclo de vida) está en SpNativePlugin. TorrentServer lo expone por HTTP en 127.0.0.1.
 *
 * Cada lector (una conexión HTTP) tiene una "ventana": desde donde está leyendo, unos 110 MB de
 * pedazos con prioridad máxima y fecha límite en los primeros. Todo lo demás queda en 0 (no se baja),
 * así el disco ocupa más o menos lo que se vio más la ventana.
 */
final class TorrentEngine {

    private static final Logger LOG = Logger.getLogger("SpTorrent");

    /** Trackers públicos conocidos: se suman a los que manda el addon. */
    static final String[] DEFAULT_TRACKERS = {
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.stealth.si:80/announce",
        "udp://tracker.torrent.eu.org:451/announce",
        "udp://open.demonii.com:1337/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://tracker.openbittorrent.com:6969/announce",
        "udp://explodie.org:6969/announce",
        "udp://tracker.dler.org:6969/announce",
        "https://tracker.tamersunion.org:443/announce",
    };

    private static final String[] VIDEO_EXT = {
        "mkv", "mp4", "m4v", "webm", "avi", "mov", "ts", "m2ts", "mts", "wmv", "flv", "mpg", "mpeg", "ogv", "3gp",
    };

    /** Error con el código HTTP que tiene que contestar el servidor. */
    static final class EngineException extends IOException {
        final int status;

        EngineException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    /** El cliente HTTP se fue (cerró la conexión): se deja de esperar. */
    interface Cancel {
        boolean cancelled();
    }

    /** Cómo va un torrent (para el texto del reproductor). */
    static final class Status {
        final String hash;
        final boolean metadata;
        final int peers;
        final int seeds;
        final long downloadRate; // bytes por segundo
        final float progress; // de lo que se pidió bajar, 0..1

        Status(String hash, boolean metadata, int peers, int seeds, long downloadRate, float progress) {
            this.hash = hash;
            this.metadata = metadata;
            this.peers = peers;
            this.seeds = seeds;
            this.downloadRate = downloadRate;
            this.progress = progress;
        }
    }

    /** Ajustes del motor. Los de fábrica son los de la app; las pruebas cambian puertos, DHT, etc. */
    static final class Options {
        String listenInterfaces = "0.0.0.0:0,[::]:0";
        boolean dht = true;
        boolean lsd = true;
        boolean defaultTrackers = true;
        int connectionsLimit = 200;
        long metadataTimeoutMs = 120_000;
        // Menos que el tiempo de lectura del reproductor (130 s): así le llega un 504 y no un corte.
        long pieceTimeoutMs = 110_000;
        long cleanupDelayMs = 60_000;
        long idleRemoveMs = 15 * 60_000;
        long sessionIdleStopMs = 5 * 60_000;
        long windowBytes = 112L << 20;
        long deadlineBytes = 16L << 20;
        long tailBytes = 2L << 20;
        int maxTorrents = 2;
        /** Solo para pruebas: pares ("ip:puerto") a los que se conecta cada torrent nuevo. */
        final List<String> testPeers = new ArrayList<>();
    }

    /** El archivo elegido de un torrent (lo que contesta el servidor). */
    static final class Selection {
        final Torrent torrent;
        final int file;
        final long size;
        final String name;

        Selection(Torrent torrent, int file) {
            this.torrent = torrent;
            this.file = file;
            this.size = torrent.fileSize[file];
            this.name = torrent.fileName[file];
        }
    }

    /** Un torrent en la sesión. Lo que no es final se toca con el lock del motor. */
    static final class Torrent {
        final String hash;
        final File dir;
        final TorrentHandle th;
        final long id;
        final Set<Reader> readers = new HashSet<>();
        // Pedazos que ya se pueden leer del archivo: havePiece y después un flushCache terminado.
        final BitSet have = new BitSet();
        // flushCache pedidos y terminados (CacheFlushedAlert), y cuándo se pidió el último (nanoTime).
        long flushIssued;
        long flushIssuedAt;
        volatile long flushDone;
        final Set<Integer> wanted = new HashSet<>();
        long lastUsed;
        long idleSince;
        long lastAnnounce;
        volatile long finished; // cuántos piece_finished llegaron (para volver a preguntar)
        volatile boolean ready;
        volatile boolean removed;
        volatile String error;
        // Con la metadata.
        int pieceLength, numPieces;
        long[] fileOffset, fileSize;
        String[] filePath, fileName;
        boolean[] pad;
        // Ventana que queda cuando no hay lectores (la del último que cerró), para no frenar en un salto.
        int ghostFile = -1;
        long ghostPos;
        Status status;

        Torrent(String hash, File dir, TorrentHandle th) {
            this.hash = hash;
            this.dir = dir;
            this.th = th;
            this.id = th.swig().id();
        }

        int pieceAt(int file, long pos) {
            long abs = fileOffset[file] + Math.max(0, Math.min(pos, Math.max(0, fileSize[file] - 1)));
            return (int) (abs / pieceLength);
        }

        int lastPiece(int file) {
            return pieceAt(file, fileSize[file] - 1);
        }
    }

    /** Un lector: una conexión HTTP leyendo un archivo desde una posición. */
    final class Reader implements AutoCloseable {
        final Torrent t;
        final int file;
        volatile long pos;
        int appliedPiece = -1;
        private RandomAccessFile raf;
        private boolean closed;

        Reader(Torrent t, int file, long pos) {
            this.t = t;
            this.file = file;
            this.pos = pos;
        }

        /**
         * Lee desde `position` (del archivo); espera a que esté el pedazo. Devuelve -1 al final y
         * como mucho lo que queda del pedazo actual.
         */
        int read(long position, byte[] buf, int off, int len, Cancel cancel) throws IOException {
            long size = t.fileSize[file];
            if (position >= size) return -1;
            pos = position;
            int piece = t.pieceAt(file, position);
            moved(this, piece);
            waitPiece(t, piece, t.lastPiece(file), cancel);
            long abs = t.fileOffset[file] + position;
            long pieceEnd = (long) (piece + 1) * t.pieceLength;
            int n = (int) Math.min(len, Math.min(pieceEnd - abs, size - position));
            if (raf == null) raf = new RandomAccessFile(t.filePath[file], "r");
            raf.seek(position);
            int got = raf.read(buf, off, n);
            if (got <= 0) throw new EngineException(500, "No se pudo leer el archivo del torrent");
            pos = position + got;
            return got;
        }

        @Override
        public void close() {
            synchronized (TorrentEngine.this) {
                if (closed) return;
                closed = true;
                readerClosed(this);
            }
            if (raf != null) {
                try {
                    raf.close();
                } catch (IOException ignored) {
                    // Ya no importa.
                }
                raf = null;
            }
        }
    }

    private static final Priority[] PRIO = new Priority[8];

    static {
        for (int i = 0; i < 8; i++) PRIO[i] = Priority.fromSwig(i);
    }

    private final File root;
    private final Options opt;
    private final Object signal = new Object();
    // Las llamadas a libtorrent fuera del lock del motor (havePiece, status) van con el de lectura;
    // apagar la sesión, con el de escritura: un handle usado mientras se destruye la sesión revienta.
    private final ReentrantReadWriteLock life = new ReentrantReadWriteLock();
    private final Map<String, Torrent> torrents = new LinkedHashMap<>();
    private final Map<Long, Torrent> byId = new HashMap<>();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor((r) -> {
        Thread th = new Thread(r, "sp-torrent-timer");
        th.setDaemon(true);
        return th;
    });
    private SessionManager session;
    private ScheduledFuture<?> cleanup;
    private long emptySince;
    private int dirSeq;
    private boolean stopped;
    private volatile Map<String, Status> statuses = Collections.emptyMap();

    TorrentEngine(File root, Options options) {
        this.root = root;
        this.opt = options;
        timer.scheduleWithFixedDelay(this::housekeeping, 1, 1, TimeUnit.SECONDS);
    }

    // ---------- lo que usa el servidor ----------

    /**
     * Abre el torrent (o reusa el que ya está), espera la metadata y elige el archivo: gana un
     * `fileIdx` válido; si no, el que se llama como `fileName`; si no, el video más grande.
     */
    Selection open(String hash, List<String> trackers, int fileIdx, String fileName, Cancel cancel) throws IOException {
        Torrent t;
        synchronized (this) {
            if (stopped) throw new EngineException(503, "El motor de torrents está cerrado");
            if (cleanup != null) cleanup.cancel(false);
            cleanup = null;
            ensureSession();
            t = torrents.get(hash);
            if (t == null) {
                t = add(hash, trackers);
            } else {
                // Lo saca y lo vuelve a poner: el más usado queda último (el primero es el más viejo).
                torrents.remove(hash);
                torrents.put(hash, t);
                addTrackers(t, trackers);
            }
            t.lastUsed = now();
        }
        waitMetadata(t, cancel);
        int file = pickFile(t, fileIdx, fileName);
        if (file < 0) throw new EngineException(404, "El torrent no tiene un video para reproducir");
        synchronized (this) {
            if (t.removed) throw new EngineException(410, "Se quitó el torrent");
            want(t, file);
            if (t.readers.isEmpty() && t.ghostFile < 0) {
                // Primer pedido (puede ser un HEAD): arranca bajando el principio del archivo.
                t.ghostFile = file;
                t.ghostPos = 0;
                applyWindows(t);
            }
        }
        return new Selection(t, file);
    }

    /** Un lector nuevo en `start` (un GET o un salto): la ventana se mueve ahí. */
    Reader reader(Selection s, long start) throws IOException {
        synchronized (this) {
            Torrent t = s.torrent;
            if (t.removed) throw new EngineException(410, "Se quitó el torrent");
            Reader r = new Reader(t, s.file, start);
            t.readers.add(r);
            t.lastUsed = now();
            r.appliedPiece = t.pieceAt(s.file, start);
            applyWindows(t);
            return r;
        }
    }

    /** El reproductor se cerró: en un minuto se borran los torrents que nadie esté leyendo. */
    synchronized void playerClosed() {
        if (stopped) return;
        if (cleanup != null) cleanup.cancel(false);
        cleanup = timer.schedule(() -> removeIdle(0), opt.cleanupDelayMs, TimeUnit.MILLISECONDS);
    }

    /** Lo último que se sabe de un torrent (no bloquea; se actualiza cada segundo). */
    Status status(String hash) {
        return statuses.get(hash);
    }

    /** Cierra todo (onDestroy). Tarda un poco: no llamarlo desde el hilo de la interfaz. */
    void stop() {
        SessionManager s;
        synchronized (this) {
            if (stopped) return;
            stopped = true;
            if (cleanup != null) cleanup.cancel(false);
            for (Torrent t : torrents.values()) t.removed = true;
            torrents.clear();
            byId.clear();
            s = session;
            session = null;
        }
        timer.shutdownNow();
        synchronized (signal) {
            signal.notifyAll();
        }
        try {
            timer.awaitTermination(3, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        stopSession(s);
        deleteTree(root);
    }

    private void stopSession(SessionManager s) {
        if (s == null) return;
        life.writeLock().lock();
        try {
            s.stop();
            LOG.info("Sesión de libtorrent cerrada");
        } catch (Throwable e) {
            LOG.log(Level.WARNING, "No se pudo cerrar la sesión", e);
        } finally {
            life.writeLock().unlock();
        }
    }

    /** Solo para pruebas: los torrents que hay en la sesión. */
    synchronized List<String> hashes() {
        return new ArrayList<>(torrents.keySet());
    }

    // ---------- sesión ----------

    private void ensureSession() throws EngineException {
        if (session != null) return;
        clearRoot();
        try {
            SettingsPack sp = new SettingsPack();
            sp.setString(settings_pack.string_types.listen_interfaces.swigValue(), opt.listenInterfaces);
            sp.setEnableDht(opt.dht);
            sp.setEnableLsd(opt.lsd);
            sp.connectionsLimit(opt.connectionsLimit);
            sp.alertQueueSize(10_000);
            // Para ver mientras baja: pedidos que tardan se piden a otro par antes.
            sp.setInteger(settings_pack.int_types.piece_timeout.swigValue(), 10);
            sp.setInteger(settings_pack.int_types.request_timeout.swigValue(), 10);
            // Cuando la ventana ya bajó entera el torrent queda "terminado": con esto en true se cortan
            // las conexiones con los que tienen todo (y se les avisa "upload only", así nos cortan
            // ellos) y al saltar hay que esperar ~60 s para volver a conectarse.
            sp.setBoolean(settings_pack.bool_types.close_redundant_connections.swigValue(), false);
            sp.setBoolean(settings_pack.bool_types.enable_upnp.swigValue(), opt.dht);
            sp.setBoolean(settings_pack.bool_types.enable_natpmp.swigValue(), opt.dht);
            SessionManager s = new SessionManager(false);
            s.addListener(alerts);
            s.start(new SessionParams(sp));
            session = s;
            emptySince = now();
            LOG.info("Sesión de libtorrent iniciada");
        } catch (Throwable e) {
            // Sin la librería nativa para este aparato (UnsatisfiedLinkError) o algo raro de libtorrent.
            LOG.log(Level.WARNING, "No arrancó la sesión de libtorrent", e);
            throw new EngineException(503, "El motor de torrents no está disponible en este aparato");
        }
    }

    private Torrent add(String hash, List<String> trackers) throws EngineException {
        // Como mucho opt.maxTorrents: se va el más viejo (primero el que nadie esté leyendo).
        while (torrents.size() >= opt.maxTorrents) {
            Torrent old = null;
            for (Torrent c : torrents.values()) {
                if (c.readers.isEmpty()) {
                    old = c;
                    break;
                }
            }
            if (old == null) old = torrents.values().iterator().next();
            remove(old);
        }
        StringBuilder magnet = new StringBuilder("magnet:?xt=urn:btih:").append(hash);
        Set<String> seen = new HashSet<>();
        List<String> all = new ArrayList<>(trackers);
        if (opt.defaultTrackers) Collections.addAll(all, DEFAULT_TRACKERS);
        for (String tr : all) {
            if (seen.add(tr)) magnet.append("&tr=").append(urlEncode(tr));
        }
        File dir = new File(root, hash + "-" + (++dirSeq));
        if (!dir.mkdirs() && !dir.isDirectory()) throw new EngineException(500, "No se pudo crear la carpeta del torrent");
        error_code ec = new error_code();
        add_torrent_params p = libtorrent.parse_magnet_uri(magnet.toString(), ec);
        if (ec.value() != 0) throw new EngineException(400, "El enlace del torrent no es válido");
        p.setSave_path(dir.getAbsolutePath());
        p.setName(hash);
        // Nada se baja hasta que lo pida un lector; sin la cola automática (no lo pausa nadie) y sin
        // la pausa de fábrica de add_torrent_params (sin auto_managed nadie la sacaría).
        torrent_flags_t off = TorrentFlags.AUTO_MANAGED.or_(TorrentFlags.PAUSED);
        torrent_flags_t flags = p.getFlags().and_(TorrentFlags.ALL.xor_(off));
        p.setFlags(flags.or_(TorrentFlags.DEFAULT_DONT_DOWNLOAD));
        torrent_handle h = session.swig().add_torrent(p, ec);
        if (ec.value() != 0 || h == null || !h.is_valid()) {
            throw new EngineException(500, "No se pudo agregar el torrent");
        }
        Torrent t = new Torrent(hash, dir, new TorrentHandle(h));
        t.idleSince = now();
        torrents.put(hash, t);
        byId.put(t.id, t);
        t.lastAnnounce = now();
        connectTestPeers(t);
        // Puede que la metadata ya esté (un torrent que se agregó antes con la misma sesión).
        loadMetadata(t);
        return t;
    }

    private void addTrackers(Torrent t, List<String> trackers) {
        if (trackers.isEmpty()) return;
        Set<String> have = new HashSet<>();
        try {
            for (AnnounceEntry e : t.th.trackers()) have.add(e.url());
            for (String tr : trackers) {
                if (!have.contains(tr)) t.th.addTracker(new AnnounceEntry(tr));
            }
        } catch (RuntimeException e) {
            LOG.log(Level.FINE, "No se pudieron sumar los trackers", e);
        }
    }

    /** Saca el torrent de la sesión y borra lo bajado (Llamar con el lock del motor). */
    private void remove(Torrent t) {
        if (t.removed) return;
        t.removed = true;
        torrents.remove(t.hash);
        byId.remove(t.id);
        if (torrents.isEmpty()) emptySince = now();
        try {
            if (session != null) session.remove(t.th, SessionHandle.DELETE_FILES);
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "No se pudo quitar el torrent", e);
        }
        synchronized (signal) {
            signal.notifyAll();
        }
        // libtorrent borra los archivos de a poco; la carpeta (única por torrent) se borra después.
        timer.schedule(() -> deleteTree(t.dir), 10, TimeUnit.SECONDS);
    }

    /** Quita los torrents sin lectores que lleven `idleMs` así. */
    private synchronized void removeIdle(long idleMs) {
        long now = now();
        for (Torrent t : new ArrayList<>(torrents.values())) {
            if (t.readers.isEmpty() && now - t.idleSince >= idleMs) remove(t);
        }
    }

    // ---------- metadata y archivo ----------

    private void waitMetadata(Torrent t, Cancel cancel) throws IOException {
        long deadline = now() + opt.metadataTimeoutMs;
        long nextPoll = 0;
        while (!t.ready) {
            if (t.removed) throw new EngineException(410, "Se quitó el torrent");
            if (cancel != null && cancel.cancelled()) throw new InterruptedIOException("El cliente se fue");
            long now = now();
            if (now >= deadline) throw new EngineException(504, "No llegó la metadata del torrent");
            if (now >= nextPoll) {
                nextPoll = now + 1000;
                synchronized (this) {
                    loadMetadata(t);
                }
                if (t.ready) break;
            }
            synchronized (signal) {
                try {
                    signal.wait(Math.min(500, deadline - now));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new InterruptedIOException();
                }
            }
        }
    }

    /** Copia lo que hace falta de la metadata (si ya llegó). Llamar con el lock del motor. */
    private void loadMetadata(Torrent t) {
        if (t.ready || t.removed) return;
        TorrentInfo ti;
        try {
            ti = t.th.torrentFile();
        } catch (RuntimeException e) {
            return;
        }
        if (ti == null || !ti.isValid()) return;
        FileStorage fs = ti.files();
        int n = fs.numFiles();
        t.pieceLength = fs.pieceLength();
        t.numPieces = fs.numPieces();
        t.fileOffset = new long[n];
        t.fileSize = new long[n];
        t.filePath = new String[n];
        t.fileName = new String[n];
        t.pad = new boolean[n];
        String save = t.dir.getAbsolutePath();
        for (int i = 0; i < n; i++) {
            t.fileOffset[i] = fs.fileOffset(i);
            t.fileSize[i] = fs.fileSize(i);
            t.filePath[i] = fs.filePath(i, save);
            t.fileName[i] = fs.fileName(i);
            t.pad[i] = fs.padFileAt(i);
        }
        t.ready = true;
        synchronized (signal) {
            signal.notifyAll();
        }
    }

    static int pickFile(Torrent t, int fileIdx, String fileName) {
        int n = t.fileSize.length;
        if (fileIdx >= 0 && fileIdx < n && !t.pad[fileIdx] && t.fileSize[fileIdx] > 0) return fileIdx;
        if (fileName != null && !fileName.isEmpty()) {
            String want = baseName(fileName).toLowerCase(Locale.ROOT);
            for (int i = 0; i < n; i++) {
                if (!t.pad[i] && t.fileSize[i] > 0 && t.fileName[i].toLowerCase(Locale.ROOT).equals(want)) return i;
            }
        }
        int best = -1;
        for (int i = 0; i < n; i++) {
            if (t.pad[i] || !isVideo(t.fileName[i])) continue;
            if (best < 0 || t.fileSize[i] > t.fileSize[best]) best = i;
        }
        return best;
    }

    static boolean isVideo(String name) {
        String ext = extension(name);
        for (String v : VIDEO_EXT) {
            if (v.equals(ext)) return true;
        }
        return false;
    }

    static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String baseName(String path) {
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return slash < 0 ? path : path.substring(slash + 1);
    }

    /** El archivo se baja a disco de verdad (no al .parts). Nunca vuelve a 0. Con el lock del motor. */
    private void want(Torrent t, int file) {
        if (!t.wanted.add(file)) return;
        Priority[] files = new Priority[t.fileSize.length];
        for (int i = 0; i < files.length; i++) files[i] = t.wanted.contains(i) ? Priority.DEFAULT : Priority.IGNORE;
        // Esto pone todos los pedazos del archivo en 4: applyWindows los vuelve a acomodar enseguida.
        t.th.prioritizeFiles(files);
        applyWindows(t);
    }

    // ---------- ventana de pedazos ----------

    /** Un lector avanzó: si se fue un buen trecho desde la última vez, se corre la ventana. */
    private void moved(Reader r, int piece) {
        Torrent t = r.t;
        int step = (int) Math.max(1, (4L << 20) / Math.max(1, t.pieceLength));
        if (r.appliedPiece >= 0 && piece >= r.appliedPiece && piece - r.appliedPiece < step) return;
        synchronized (this) {
            if (t.removed) return;
            r.appliedPiece = piece;
            t.lastUsed = now();
            applyWindows(t);
        }
    }

    private void readerClosed(Reader r) {
        Torrent t = r.t;
        t.readers.remove(r);
        if (t.readers.isEmpty()) {
            // La ventana queda donde estaba (el reproductor suele abrir otra conexión enseguida).
            t.ghostFile = r.file;
            t.ghostPos = r.pos;
            t.idleSince = now();
        }
    }

    /** Recalcula las prioridades de todos los pedazos según los lectores. Con el lock del motor. */
    private void applyWindows(Torrent t) {
        if (!t.ready || t.removed) return;
        byte[] prio = new byte[t.numPieces];
        List<int[]> deadlines = new ArrayList<>();
        List<long[]> wins = new ArrayList<>();
        if (t.readers.isEmpty()) {
            if (t.ghostFile >= 0) wins.add(new long[] { t.ghostFile, t.ghostPos });
        } else {
            for (Reader r : t.readers) wins.add(new long[] { r.file, r.pos });
        }
        int pl = Math.max(1, t.pieceLength);
        int windowPieces = (int) Math.max(2, (opt.windowBytes + pl - 1) / pl);
        int dlPieces = (int) Math.max(3, Math.min(20, (opt.deadlineBytes + pl - 1) / pl));
        int topPieces = Math.max(dlPieces, windowPieces / 3);
        int tailPieces = (int) Math.max(1, (opt.tailBytes + pl - 1) / pl);
        Set<Integer> files = new HashSet<>();
        for (long[] w : wins) {
            int file = (int) w[0];
            files.add(file);
            int first = t.pieceAt(file, w[1]);
            int last = Math.min(t.lastPiece(file), first + windowPieces - 1);
            for (int p = first; p <= last; p++) {
                int i = p - first;
                byte v = (byte) (i < topPieces ? 7 : 6);
                if (prio[p] < v) prio[p] = v;
                if (i < dlPieces && !hasPiece(t, p)) {
                    // La más apurada es la que se necesita ya; las siguientes, un segundo más cada una.
                    deadlines.add(new int[] { p, i == 0 ? 0 : 500 + i * 1000 });
                }
            }
        }
        // El final del archivo (ahí suelen estar los índices del MKV o el moov del MP4), sin apuro.
        for (int file : files) {
            int lastP = t.lastPiece(file);
            int firstP = Math.max(t.pieceAt(file, 0), lastP - tailPieces + 1);
            for (int p = firstP; p <= lastP; p++) {
                if (prio[p] < 1) prio[p] = 1;
            }
        }
        Priority[] arr = new Priority[prio.length];
        for (int i = 0; i < prio.length; i++) arr[i] = PRIO[prio[i]];
        try {
            t.th.prioritizePieces(arr);
            t.th.clearPieceDeadlines();
            for (int[] d : deadlines) t.th.setPieceDeadline(d[0], d[1]);
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "No se pudo mover la ventana", e);
        }
    }

    // ---------- pedazos ----------

    private static boolean hasPiece(Torrent t, int piece) {
        synchronized (t.have) {
            return t.have.get(piece);
        }
    }

    /**
     * Espera a que el pedazo se pueda leer del archivo. Que libtorrent lo tenga (havePiece) no
     * alcanza: el hash se verifica con los bloques en memoria y la escritura puede seguir en cola
     * (se leían ceros). Por eso, con havePiece, se pide un flushCache, que pasa cuando terminó
     * todo lo que estaba en cola; ahí se marcan este pedazo y los siguientes que ya estaban.
     */
    private void waitPiece(Torrent t, int piece, int lastPiece, Cancel cancel) throws IOException {
        if (hasPiece(t, piece)) return;
        long start = now();
        long nextPoll = 0;
        long seenFinished = -1;
        long ticket = -1;
        long ticketAt = 0;
        int[] batch = null;
        boolean logged = false;
        while (true) {
            if (t.removed) throw new EngineException(410, "Se quitó el torrent");
            if (t.error != null) throw new EngineException(500, t.error);
            long now = now();
            if (ticket >= 0) {
                if (t.flushDone >= ticket) {
                    synchronized (t.have) {
                        for (int p : batch) t.have.set(p);
                    }
                    return;
                }
                // Si el aviso se perdió (o se reinició algo), se pide de nuevo.
                if (now - ticketAt > 3000) ticket = -1;
            }
            long finished = t.finished;
            // Se pregunta cuando terminó algún pedazo y, por las dudas (avisos perdidos), cada segundo.
            if (ticket < 0 && (finished != seenFinished || now >= nextPoll)) {
                seenFinished = finished;
                nextPoll = now + 1000;
                long seen = System.nanoTime();
                batch = haveFrom(t, piece, lastPiece);
                if (batch != null) {
                    ticket = askFlush(t, seen);
                    ticketAt = now;
                    if (ticket >= 0) continue;
                }
            }
            if (cancel != null && cancel.cancelled()) throw new InterruptedIOException("El cliente se fue");
            if (now - start > opt.pieceTimeoutMs) throw new EngineException(504, "No llegan datos del torrent");
            if (!logged && now - start > 10_000) {
                logged = true;
                logWait(t, piece);
            }
            synchronized (signal) {
                try {
                    signal.wait(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new InterruptedIOException();
                }
            }
        }
    }

    /**
     * Si libtorrent ya tiene `piece`, devuelve ese pedazo y los siguientes (hasta 64, sin pasar del
     * archivo) que también tiene; si no, null.
     */
    private int[] haveFrom(Torrent t, int piece, int lastPiece) {
        life.readLock().lock();
        try {
            if (stopped || t.removed || !t.th.havePiece(piece)) return null;
            int end = Math.min(lastPiece, piece + 63);
            int[] out = new int[end - piece + 1];
            int n = 0;
            out[n++] = piece;
            for (int p = piece + 1; p <= end; p++) {
                if (t.th.havePiece(p)) out[n++] = p;
            }
            return java.util.Arrays.copyOf(out, n);
        } catch (RuntimeException e) {
            return null; // El torrent se está yendo: lo dice `removed` en la vuelta siguiente.
        } finally {
            life.readLock().unlock();
        }
    }

    /**
     * Pide un flushCache posterior a `seen` (cuando se vio havePiece) y devuelve cuántos tienen que
     * haber terminado; si ya hay uno pedido después, se usa ese. -1 si no se pudo pedir.
     */
    private long askFlush(Torrent t, long seen) {
        life.readLock().lock();
        try {
            synchronized (t.have) {
                if (t.flushIssued > t.flushDone && t.flushIssuedAt - seen > 0) return t.flushIssued;
                if (stopped || t.removed) return -1;
                t.th.flushCache();
                t.flushIssued++;
                t.flushIssuedAt = System.nanoTime();
                return t.flushIssued;
            }
        } catch (RuntimeException e) {
            return -1;
        } finally {
            life.readLock().unlock();
        }
    }

    /** Para el logcat: un pedazo que tarda mucho (¿sin pares? ¿no estaba en la ventana?). */
    private void logWait(Torrent t, int piece) {
        life.readLock().lock();
        try {
            if (stopped || t.removed) return;
            TorrentStatus s = t.th.status(true);
            LOG.warning(String.format(Locale.ROOT, "Esperando el pedazo %d de %s: prioridad %d, pares %d, %d B/s, estado %s",
                piece, t.hash, t.th.piecePriority(piece).swig(), s.numPeers(), s.downloadPayloadRate(), s.state()));
        } catch (RuntimeException ignored) {
            // Solo era para el log.
        } finally {
            life.readLock().unlock();
        }
    }

    private final AlertListener alerts = new AlertListener() {
        @Override
        public int[] types() {
            return new int[] {
                AlertType.PIECE_FINISHED.swig(), AlertType.METADATA_RECEIVED.swig(), AlertType.TORRENT_ERROR.swig(),
                AlertType.FILE_ERROR.swig(), AlertType.CACHE_FLUSHED.swig(),
            };
        }

        @Override
        public void alert(Alert<?> a) {
            if (!(a instanceof TorrentAlert)) return;
            Torrent t;
            synchronized (TorrentEngine.this) {
                t = byId.get(((TorrentAlert<?>) a).handle().swig().id());
                if (t == null) return;
                AlertType type = a.type();
                if (type == AlertType.METADATA_RECEIVED) {
                    loadMetadata(t);
                } else if (type == AlertType.TORRENT_ERROR || type == AlertType.FILE_ERROR) {
                    t.error = "El torrent dio un error al guardar: " + a.message();
                    LOG.warning(t.error);
                }
            }
            // Solo despierta a los que esperan: qué se puede leer lo decide waitPiece.
            if (a instanceof PieceFinishedAlert) t.finished++;
            else if (a instanceof CacheFlushedAlert) t.flushDone++;
            synchronized (signal) {
                signal.notifyAll();
            }
        }
    };

    // ---------- mantenimiento (cada segundo) ----------

    private void housekeeping() {
        try {
            List<Torrent> list;
            synchronized (this) {
                if (stopped || session == null) return;
                list = new ArrayList<>(torrents.values());
            }
            Map<String, Status> next = new HashMap<>();
            life.readLock().lock();
            try {
                for (Torrent t : list) {
                    if (stopped || t.removed) continue;
                    try {
                        TorrentStatus s = t.th.status(true);
                        next.put(t.hash, new Status(t.hash, t.ready, s.numPeers(), s.numSeeds(), s.downloadPayloadRate(), s.progress()));
                        if (s.numPeers() == 0) reconnect(t);
                    } catch (RuntimeException ignored) {
                        // Se acaba de quitar.
                    }
                }
            } finally {
                life.readLock().unlock();
            }
            statuses = next;
            SessionManager toStop = null;
            synchronized (this) {
                // Por si el reproductor nunca avisó: lo que nadie lee hace rato se borra.
                removeIdle(opt.idleRemoveMs);
                // Sin torrents un buen rato se apaga la sesión (DHT y demás gastan batería); vuelve sola.
                if (torrents.isEmpty() && session != null && now() - emptySince > opt.sessionIdleStopMs) {
                    toStop = session;
                    session = null;
                }
            }
            stopSession(toStop);
        } catch (Throwable e) {
            LOG.log(Level.WARNING, "Falló el mantenimiento del motor", e);
        }
    }

    /** Sin pares y con alguien leyendo: se vuelve a preguntar a trackers y DHT (cada 30 s como mucho). */
    private void reconnect(Torrent t) {
        boolean reading;
        synchronized (this) {
            reading = !t.readers.isEmpty() || t.ghostFile >= 0;
        }
        long now = now();
        if (!reading || t.removed || now - t.lastAnnounce < 30_000) return;
        t.lastAnnounce = now;
        try {
            t.th.forceReannounce();
            if (opt.dht) t.th.forceDHTAnnounce();
            connectTestPeers(t);
        } catch (RuntimeException e) {
            LOG.log(Level.FINE, "No se pudo volver a anunciar", e);
        }
    }

    private void connectTestPeers(Torrent t) {
        for (String peer : opt.testPeers) {
            int c = peer.lastIndexOf(':');
            t.th.swig().connect_peer(new TcpEndpoint(peer.substring(0, c), Integer.parseInt(peer.substring(c + 1))).swig());
        }
    }

    // ---------- utilidades ----------

    /** Lo que quedó de antes se borra en otro hilo (renombrar es instantáneo; borrar GB, no). */
    private void clearRoot() {
        File parent = root.getAbsoluteFile().getParentFile();
        if (root.exists()) {
            File trash = new File(parent, root.getName() + "-trash-" + System.nanoTime());
            if (!root.renameTo(trash)) deleteTree(root);
        }
        root.mkdirs();
        File[] old = parent != null ? parent.listFiles() : null;
        if (old == null) return;
        for (File f : old) {
            if (f.getName().startsWith(root.getName() + "-trash-")) timer.execute(() -> deleteTree(f));
        }
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.isDirectory() ? f.listFiles() : null;
        if (kids != null) {
            for (File k : kids) deleteTree(k);
        }
        if (!f.delete() && f.exists()) LOG.fine("No se pudo borrar " + f);
    }

    private static String urlEncode(String s) {
        try {
            return java.net.URLEncoder.encode(s, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static long now() {
        return System.nanoTime() / 1_000_000;
    }
}
