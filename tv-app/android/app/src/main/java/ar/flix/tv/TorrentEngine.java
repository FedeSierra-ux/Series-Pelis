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
import org.libtorrent4j.swig.alert;
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

    /** Un flush pedido sin aviso en este tiempo se da por perdido (ver askFlush). */
    static final long FLUSH_LOST_MS = 5_000;

    /** Carpetas (`home`) de los motores vivos: la limpieza de `root` nunca las toca. */
    private static final Set<String> LIVE = java.util.concurrent.ConcurrentHashMap.newKeySet();
    /** Una limpieza de `root` a la vez (cada una en su hilo). */
    private static final Object SWEEP = new Object();
    private static final java.util.concurrent.atomic.AtomicInteger SWEEPS = new java.util.concurrent.atomic.AtomicInteger();
    private static final String TRASH = "-basura-";

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
        // Subida: hace falta para que los pares nos manden (el que no sube queda último en la cola),
        // pero sin tope se come la subida de la casa (y en el celular, los datos). 1 MB/s alcanza.
        int uploadRateLimit = 1 << 20;
        // Plazo de un pedido entero (metadata + primer pedazo), contado desde que entra. Siempre menos
        // que el tiempo de lectura del reproductor (130 s): así le llega un 504 claro y no un corte.
        long requestTimeoutMs = 115_000;
        // Cada pedazo siguiente, ya mandando el cuerpo (el cliente cuenta desde el último byte).
        long pieceTimeoutMs = 110_000;
        // Archivo que todavía no apareció en disco (libtorrent lo saca del .parts en otro hilo).
        long fileOpenTimeoutMs = 15_000;
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
        // Todos con el lock de `have`; flushDone nunca pasa a flushIssued (ver el listener).
        long flushIssued;
        long flushIssuedAt;
        long flushDone;
        // Desde cuándo (nanoTime) hay flushes pendientes sin parar (flushIssued > flushDone). Con
        // uno perdido nunca se emparejan (cada aviso que llega es del anterior); pasados
        // FLUSH_LOST_MS se dan por perdidos (ver askFlush). Los avisos no lo reinician: justo en
        // ese caso siguen llegando, uno atrás.
        long flushWaitSince;
        // Un ticket menor no marca nada: lo sube want() (el pase del .parts va detrás) y un flush
        // perdido (los tickets viejos se cumplirían sin que haya pasado nada por el disco).
        long minTicket;
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
            return read(position, buf, off, len, cancel, 0);
        }

        /**
         * Igual, con el plazo del pedido (`requestDeadline`) para la primera lectura; 0 = el de un
         * pedazo (`pieceTimeoutMs`) desde ahora.
         */
        int read(long position, byte[] buf, int off, int len, Cancel cancel, long deadline) throws IOException {
            long size = t.fileSize[file];
            if (position >= size) return -1;
            pos = position;
            int piece = t.pieceAt(file, position);
            moved(this, piece);
            waitPiece(t, piece, t.lastPiece(file), cancel, deadline);
            long abs = t.fileOffset[file] + position;
            long pieceEnd = (long) (piece + 1) * t.pieceLength;
            int n = (int) Math.min(len, Math.min(pieceEnd - abs, size - position));
            if (raf == null) raf = openFile(cancel, deadline);
            raf.seek(position);
            int got = raf.read(buf, off, n);
            if (got <= 0) throw new EngineException(500, "No se pudo leer el archivo del torrent");
            pos = position + got;
            return got;
        }

        /**
         * Un archivo que pasó de "no se baja" a querido (otro episodio del mismo pack) puede no
         * existir todavía: libtorrent lo arma con lo del .parts en su hilo de disco. Se espera un poco.
         */
        private RandomAccessFile openFile(Cancel cancel, long deadline) throws IOException {
            long limit = activeMs() + opt.fileOpenTimeoutMs;
            if (deadline > 0) limit = Math.min(limit, deadline);
            while (true) {
                try {
                    return new RandomAccessFile(t.filePath[file], "r");
                } catch (java.io.FileNotFoundException e) {
                    if (t.removed) throw new EngineException(410, "Se quitó el torrent");
                    if (t.error != null) throw new EngineException(500, t.error);
                    if (cancel != null && cancel.cancelled()) throw new InterruptedIOException("El cliente se fue");
                    if (activeMs() >= limit) throw new EngineException(504, "No aparece el archivo del torrent");
                }
                synchronized (signal) {
                    try {
                        signal.wait(200);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new InterruptedIOException();
                    }
                }
            }
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

    // `root` es de todos los motores (cache/torrents); `home`, una subcarpeta solo de este. Si la
    // Activity se recrea, el motor viejo se para en otro hilo mientras arranca el nuevo: cada uno
    // borra lo suyo y el nuevo, lo que quedó de antes (nunca la carpeta del otro mientras escribe).
    private final File root;
    private final File home;
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
    private volatile boolean stopped;
    // App en segundo plano: la sesión queda en pausa (ni baja ni sube). Los plazos no corren en pausa.
    // Con su propio lock (`clock`): activeMs() se llama en cada vuelta de las esperas y no tiene que
    // pelear el lock del motor con applyWindows y compañía.
    private final Object clock = new Object();
    private volatile boolean paused;
    private long pausedSince;
    private long pausedTotal;
    private volatile Map<String, Status> statuses = Collections.emptyMap();

    TorrentEngine(File root, Options options) {
        this.root = root;
        this.home = new File(root, "m-" + Long.toString(System.currentTimeMillis(), 36) + "-"
            + Integer.toHexString(new java.util.Random().nextInt() & 0xfffff));
        this.opt = options;
        LIVE.add(home.getName());
        timer.scheduleWithFixedDelay(this::housekeeping, 1, 1, TimeUnit.SECONDS);
        // Lo que quedó de antes (la app se cerró de golpe, un motor viejo que no llegó a borrar lo
        // suyo) se borra ya, en otro hilo: no hace falta esperar al primer torrent.
        sweepRoot();
    }

    // ---------- lo que usa el servidor ----------

    /**
     * Plazo de un pedido que entra ahora (`requestTimeoutMs`): lo comparten la metadata y el primer
     * pedazo, así el total nunca pasa del tiempo de lectura del reproductor.
     */
    long requestDeadline() {
        return activeMs() + opt.requestTimeoutMs;
    }

    /**
     * Abre el torrent (o reusa el que ya está), espera la metadata (hasta `deadline`, de
     * `requestDeadline`) y elige el archivo: gana un `fileIdx` válido; si no, el que se llama como
     * `fileName`; si no, el video más grande.
     */
    Selection open(String hash, List<String> trackers, int fileIdx, String fileName, Cancel cancel, long deadline) throws IOException {
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
        waitMetadata(t, cancel, deadline);
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

    /**
     * El reproductor sigue abierto con un torrent (la app volvió después de que se avisó el cierre
     * por estar mucho en segundo plano): no se borra nada.
     */
    synchronized void playerReopened() {
        if (cleanup != null) cleanup.cancel(false);
        cleanup = null;
    }

    /** Solo para pruebas: hay una limpieza programada (playerClosed sin lectores nuevos). */
    synchronized boolean cleanupPending() {
        return cleanup != null && !cleanup.isDone();
    }

    /**
     * La app pasó a segundo plano: la sesión entera en pausa (corta pares, no baja ni sube). Las
     * llamadas a libtorrent van en el hilo del motor (no en el de la interfaz).
     */
    void pause() {
        synchronized (clock) {
            if (stopped || paused) return;
            pausedSince = now();
            paused = true;
        }
        runOnTimer(this::applyPause);
    }

    /** Volvió la app: la sesión sigue (y los plazos de los pedidos vuelven a correr). */
    void resume() {
        synchronized (clock) {
            if (stopped || !paused) return;
            pausedTotal += now() - pausedSince;
            paused = false;
        }
        runOnTimer(this::applyPause);
        synchronized (signal) {
            signal.notifyAll();
        }
    }

    boolean isPaused() {
        return paused;
    }

    private void runOnTimer(Runnable r) {
        try {
            timer.execute(r);
        } catch (java.util.concurrent.RejectedExecutionException e) {
            // El motor se está parando.
        }
    }

    /** Pone la sesión como dice `paused` (en el hilo del motor; nunca con el lock tomado). */
    private void applyPause() {
        SessionManager s;
        synchronized (this) {
            s = session;
        }
        boolean p = paused;
        if (s == null) return; // ensureSession la arranca ya en pausa
        life.readLock().lock();
        try {
            if (stopped) return;
            if (p) s.pause();
            else s.resume();
            LOG.info(p ? "Motor en pausa (segundo plano)" : "Motor otra vez andando");
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "No se pudo pausar o seguir la sesión", e);
        } finally {
            life.readLock().unlock();
        }
    }

    /** Milisegundos del motor sin contar el tiempo en pausa (para los plazos de los pedidos). */
    private long activeMs() {
        synchronized (clock) {
            long n = now();
            return n - pausedTotal - (paused ? n - pausedSince : 0);
        }
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
        // Solo lo de este motor (su carpeta y la basura que dejó al reiniciar la sesión): la carpeta
        // de uno nuevo (Activity recreada) puede estar al lado.
        try {
            deleteTree(home);
            String trash = home.getName() + TRASH;
            File[] left = root.listFiles();
            if (left != null) {
                for (File f : left) {
                    if (f.getName().startsWith(trash)) deleteTree(f);
                }
            }
        } finally {
            LIVE.remove(home.getName());
        }
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

    /** Solo para pruebas: {flushIssued, flushDone} de un torrent (o null). */
    long[] flushCounters(String hash) {
        Torrent t;
        synchronized (this) {
            t = torrents.get(hash);
        }
        if (t == null) return null;
        synchronized (t.have) {
            return new long[] { t.flushIssued, t.flushDone };
        }
    }

    /**
     * Solo para pruebas: un flush "pedido" del que nunca va a llegar el aviso (lo que pasa cuando
     * libtorrent no tiene storage), y se olvida `have` así la próxima lectura tiene que esperarlo.
     */
    boolean loseFlush(String hash) {
        Torrent t;
        synchronized (this) {
            t = torrents.get(hash);
        }
        if (t == null) return false;
        synchronized (t.have) {
            if (t.flushIssued == t.flushDone) t.flushWaitSince = System.nanoTime();
            t.flushIssued++;
            t.flushIssuedAt = System.nanoTime();
            t.have.clear();
        }
        return true;
    }

    /** Solo para pruebas: la carpeta de este motor (adentro de `root`). */
    File home() {
        return home;
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
            sp.uploadRateLimit(opt.uploadRateLimit);
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
            // SessionManager pone su alert_mask al arrancar (todo menos los logs); se le saca
            // "storage": así solo llegan los cache_flushed que pide askFlush. libtorrent también
            // los manda solos (al quedar "terminado" un torrent libera los archivos) y esos
            // adelantaban el contador: un flush pedido después se daba por hecho y se leían ceros.
            // file_error y torrent_error siguen llegando (son también de "error").
            // Tampoco hacen falta (y son miles por segundo bajando rápido, cada uno un objeto Java que
            // pasa por el hilo de avisos): bloques, pares, subida, progreso de archivos y conexiones.
            // Lo que usa el motor (piece_finished, metadata, errores, cache_flushed pedidos) y lo que
            // usa SessionManager (session_stats, portmap, listen, external_ip, add_torrent) queda.
            int mask = s.settings().getInteger(settings_pack.int_types.alert_mask.swigValue());
            int off = alert.storage_notification.to_int() | alert.block_progress_notification.to_int()
                | alert.peer_notification.to_int() | alert.upload_notification.to_int()
                | alert.file_progress_notification.to_int() | alert.connect_notification.to_int();
            SettingsPack m = new SettingsPack();
            m.setInteger(settings_pack.int_types.alert_mask.swigValue(), mask & ~off);
            s.applySettings(m);
            if (paused) s.pause();
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
        File dir = new File(home, hash + "-" + (++dirSeq));
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

    private void waitMetadata(Torrent t, Cancel cancel, long deadline) throws IOException {
        long nextPoll = 0;
        while (!t.ready) {
            if (t.removed) throw new EngineException(410, "Se quitó el torrent");
            if (cancel != null && cancel.cancelled()) throw new InterruptedIOException("El cliente se fue");
            long now = now();
            if (activeMs() >= deadline) throw new EngineException(504, "No llegó la metadata del torrent");
            if (now >= nextPoll) {
                nextPoll = now + 1000;
                synchronized (this) {
                    loadMetadata(t);
                }
                if (t.ready) break;
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
        // El primer y el último pedazo pueden ser compartidos con otro archivo ya bajado (pack de
        // temporada): están en `have`, pero lo de este archivo quedó en el .parts y libtorrent lo
        // pasa al archivo en su hilo de disco. Se sacan de `have` para que vuelvan a pasar por
        // waitPiece: el flushCache que pide va detrás de ese pase. Un ticket de antes (un lector que
        // ya esperaba esos pedazos) podría cumplirse con un flush pedido antes del pase y volver a
        // marcarlos: con minTicket solo sirve uno pedido desde ahora.
        synchronized (t.have) {
            t.have.clear(t.pieceAt(file, 0));
            t.have.clear(t.lastPiece(file));
            t.minTicket = Math.max(t.minTicket, t.flushIssued + 1);
        }
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
    private void waitPiece(Torrent t, int piece, int lastPiece, Cancel cancel, long deadline) throws IOException {
        if (hasPiece(t, piece)) return;
        long limit = deadline > 0 ? deadline : activeMs() + opt.pieceTimeoutMs;
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
                boolean flushed;
                boolean stale;
                synchronized (t.have) {
                    stale = ticket < t.minTicket;
                    flushed = !stale && t.flushDone >= ticket;
                    if (flushed) {
                        for (int p : batch) t.have.set(p);
                    }
                }
                if (flushed) return;
                if (stale) {
                    // Pedido antes de un want() o de un flush perdido: no prueba nada, se pide otro ya.
                    ticket = -1;
                    nextPoll = 0;
                } else if (now - ticketAt > 3000) {
                    // Si el aviso se perdió (o se reinició algo), se pide de nuevo.
                    ticket = -1;
                }
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
            if (activeMs() > limit) throw new EngineException(504, "No llegan datos del torrent");
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
     *
     * libtorrent no avisa un flush que no pudo hacer (torrent sin storage, sesión cerrándose): sin
     * esto los avisos quedaban uno atrás para siempre y cada pedido terminaba en 504. Si hace
     * FLUSH_LOST_MS que hay pendientes sin parar, se dan todos por perdidos y se pide uno nuevo; los
     * tickets de antes dejan de servir (minTicket), así nadie marca un pedazo sin un flush de verdad.
     * (Un flush de verdad tarda milisegundos; 5 s seguidos con la cola llena es que se perdió uno.)
     */
    private long askFlush(Torrent t, long seen) {
        life.readLock().lock();
        try {
            synchronized (t.have) {
                long nowNs = System.nanoTime();
                if (t.flushIssued > t.flushDone && nowNs - t.flushWaitSince > FLUSH_LOST_MS * 1_000_000L) {
                    LOG.warning(String.format(Locale.ROOT, "%s: %d flush sin aviso, se dan por perdidos",
                        t.hash, t.flushIssued - t.flushDone));
                    t.flushDone = t.flushIssued;
                    t.minTicket = Math.max(t.minTicket, t.flushIssued + 1);
                }
                if (t.flushIssued > t.flushDone && t.flushIssued >= t.minTicket && t.flushIssuedAt - seen > 0) {
                    return t.flushIssued;
                }
                if (stopped || t.removed) return -1;
                t.th.flushCache();
                if (t.flushIssued == t.flushDone) t.flushWaitSince = nowNs;
                t.flushIssued++;
                t.flushIssuedAt = nowNs;
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
            if (a instanceof PieceFinishedAlert) {
                t.finished++;
            } else if (a instanceof CacheFlushedAlert) {
                // Uno por cada flushCache pedido, en orden (cada uno espera al anterior en el hilo de
                // disco). Uno que no pidió nadie (no deberían llegar: ver el alert_mask) nunca puede
                // dar por hecho un flush futuro: el contador no pasa de los pedidos.
                synchronized (t.have) {
                    if (t.flushDone < t.flushIssued) t.flushDone++;
                }
            }
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
        // En pausa no hay pares a propósito: anunciar despertaría la radio para nada (y los
        // trackers devolverían pares a los que no nos conectamos).
        if (paused) return;
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

    /**
     * Carpeta limpia para una sesión nueva. La de este motor (de una sesión anterior que se apagó
     * por estar sin uso) se renombra a `<home>-basura-<n>` (renombrar es instantáneo, borrar GB no)
     * y se borra en otro hilo junto con lo que haya quedado de antes (ver sweepRoot). El nombre lleva
     * el de este motor: si stop() llega antes que la limpieza, la borra él.
     */
    private void clearRoot() {
        if (home.exists()) {
            File trash = new File(root, home.getName() + TRASH + System.nanoTime());
            if (!home.renameTo(trash)) deleteTree(home);
        }
        home.mkdirs();
        sweepRoot();
    }

    /**
     * Borra en otro hilo (nunca el del motor: con GB tarda y frenaba el mantenimiento) todo lo que
     * hay en `root` menos las carpetas de los motores vivos (LIVE): basura de reinicios, carpetas
     * `m-*` de motores que no llegaron a parar (la app se cerró de golpe) y lo de versiones viejas.
     */
    private void sweepRoot() {
        SWEEPS.incrementAndGet();
        Thread th = new Thread(() -> {
            try {
                synchronized (SWEEP) {
                    File[] old = root.listFiles();
                    if (old == null) return;
                    for (File f : old) {
                        // Se mira justo antes de borrar: un motor nuevo se anota antes de crear su carpeta.
                        if (!LIVE.contains(f.getName())) deleteTree(f);
                    }
                }
            } catch (RuntimeException e) {
                LOG.log(Level.FINE, "No se pudo limpiar la carpeta de torrents", e);
            } finally {
                SWEEPS.decrementAndGet();
            }
        }, "sp-torrent-sweep");
        th.setDaemon(true);
        th.setPriority(Thread.MIN_PRIORITY);
        th.start();
    }

    /** Solo para pruebas: espera (hasta `ms`) a que terminen las limpiezas de `root`. */
    static boolean awaitSweeps(long ms) throws InterruptedException {
        long end = System.nanoTime() + ms * 1_000_000L;
        while (SWEEPS.get() > 0) {
            if (System.nanoTime() > end) return false;
            Thread.sleep(20);
        }
        return true;
    }

    /** Borra la carpeta y lo que tiene. Un enlace simbólico se borra él solo: nunca se entra. */
    static void deleteTree(File f) {
        if (f == null) return;
        if (isSymlink(f)) {
            if (!f.delete()) LOG.fine("No se pudo borrar el enlace " + f);
            return;
        }
        if (!f.exists()) {
            // exists() sigue el enlace: uno roto (apunta a algo que ya no está) da false, e
            // isSymlink no lo ve (la ruta canónica de uno roto es la suya). delete() lo borra a él.
            f.delete();
            return;
        }
        File[] kids = f.isDirectory() ? f.listFiles() : null;
        if (kids != null) {
            for (File k : kids) deleteTree(k);
        }
        if (!f.delete() && f.exists()) LOG.fine("No se pudo borrar " + f);
    }

    /**
     * Sin java.nio.file (recién desde Android 8; la app va desde el 7): es un enlace si su ruta
     * canónica no es la de la carpeta canónica más el nombre. Ante la duda, se toma como enlace.
     */
    static boolean isSymlink(File f) {
        try {
            File parent = f.getAbsoluteFile().getParentFile();
            if (parent == null) return false;
            File inCanonical = new File(parent.getCanonicalFile(), f.getName());
            return !inCanonical.getCanonicalFile().equals(inCanonical.getAbsoluteFile());
        } catch (IOException | SecurityException e) {
            return true;
        }
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
