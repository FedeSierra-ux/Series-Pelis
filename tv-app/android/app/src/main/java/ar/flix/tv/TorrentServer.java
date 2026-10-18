package ar.flix.tv;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Servidor HTTP mínimo en 127.0.0.1 para el motor de torrents (v0.25). El reproductor (y la web, por
 * `getInfo().torrent`) piden:
 *
 *   GET|HEAD http://127.0.0.1:&lt;puerto&gt;/&lt;token&gt;/&lt;infoHash&gt;/&lt;fileIdx&gt;[?tr=…&amp;tr=…&amp;f=…]
 *
 * El token (128 bits al azar) evita que otra app del aparato use el motor. Contesta Range (206/416),
 * una conexión por pedido (`Connection: close`) y un hilo por conexión con tope. Java puro: se prueba
 * en la JVM.
 */
final class TorrentServer {

    private static final Logger LOG = Logger.getLogger("SpTorrent");
    private static final int MAX_HEADER_BYTES = 16 * 1024;
    private static final int MAX_TRACKERS = 30;
    private static final int MAX_THREADS = 12;
    private static final int BUFFER = 64 * 1024;

    private static final Map<String, String> TYPES = new HashMap<>();

    static {
        TYPES.put("mkv", "video/x-matroska");
        TYPES.put("mk3d", "video/x-matroska");
        TYPES.put("mp4", "video/mp4");
        TYPES.put("m4v", "video/x-m4v");
        TYPES.put("webm", "video/webm");
        TYPES.put("avi", "video/x-msvideo");
        TYPES.put("ts", "video/mp2t");
        TYPES.put("m2ts", "video/mp2t");
        TYPES.put("mts", "video/mp2t");
        TYPES.put("mov", "video/quicktime");
        TYPES.put("wmv", "video/x-ms-wmv");
        TYPES.put("flv", "video/x-flv");
        TYPES.put("mpg", "video/mpeg");
        TYPES.put("mpeg", "video/mpeg");
        TYPES.put("ogv", "video/ogg");
        TYPES.put("3gp", "video/3gpp");
        TYPES.put("mp3", "audio/mpeg");
        TYPES.put("m4a", "audio/mp4");
        TYPES.put("flac", "audio/flac");
        TYPES.put("srt", "application/x-subrip");
        TYPES.put("vtt", "text/vtt");
    }

    private final TorrentEngine engine;
    private final ServerSocket socket;
    private final String token;
    private final String base;
    private final ThreadPoolExecutor pool;
    private volatile boolean closed;

    /** Abre el puerto ya (así `getInfo` puede dar la dirección); libtorrent arranca con el primer pedido. */
    TorrentServer(TorrentEngine engine) throws IOException {
        this.engine = engine;
        this.socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        byte[] raw = new byte[16];
        new SecureRandom().nextBytes(raw);
        this.token = hex(raw);
        this.base = "http://127.0.0.1:" + socket.getLocalPort() + "/" + token;
        this.pool = new ThreadPoolExecutor(0, MAX_THREADS, 30, TimeUnit.SECONDS, new SynchronousQueue<>(), (r) -> {
            Thread th = new Thread(r, "sp-torrent-http");
            th.setDaemon(true);
            return th;
        });
        Thread accept = new Thread(this::acceptLoop, "sp-torrent-accept");
        accept.setDaemon(true);
        accept.start();
    }

    /** Base para la web: `http://127.0.0.1:<puerto>/<token>`. */
    String baseUrl() {
        return base;
    }

    TorrentEngine engine() {
        return engine;
    }

    /** ¿Esta URL es del motor? (el reproductor le pone otros tiempos y otros mensajes de error). */
    boolean owns(String url) {
        return url != null && (url.equals(base) || url.startsWith(base + "/"));
    }

    /** El infoHash de una URL del motor (o null). */
    String hashOf(String url) {
        if (!owns(url)) return null;
        String rest = url.substring(base.length());
        if (rest.length() < 42 || rest.charAt(0) != '/') return null;
        String hash = rest.substring(1, 41).toLowerCase(Locale.ROOT);
        return isHash(hash) ? hash : null;
    }

    /** Cierra el puerto. El motor se para aparte (tarda y no va en el hilo de la interfaz). */
    void shutdown() {
        closed = true;
        try {
            socket.close();
        } catch (IOException ignored) {
            // Ya estaba cerrado.
        }
        pool.shutdownNow();
    }

    private void acceptLoop() {
        while (!closed) {
            Socket s;
            try {
                s = socket.accept();
            } catch (IOException e) {
                if (!closed) LOG.log(Level.WARNING, "Falló accept", e);
                if (socket.isClosed()) return;
                continue;
            }
            try {
                pool.execute(() -> handle(s));
            } catch (RejectedExecutionException e) {
                // Demasiadas conexiones a la vez: se contesta corto y se cierra.
                try {
                    s.setSoTimeout(2000);
                    simple(s.getOutputStream(), 503, "Demasiadas conexiones", false);
                } catch (IOException ignored) {
                    // Nada.
                }
                closeQuietly(s);
            }
        }
    }

    // ---------- un pedido ----------

    private void handle(Socket s) {
        try {
            s.setSoTimeout(15_000);
            s.setTcpNoDelay(true);
            InputStream in = s.getInputStream();
            OutputStream out = new BufferedOutputStream(s.getOutputStream(), BUFFER);
            Request req;
            try {
                req = Request.parse(in);
            } catch (IOException e) {
                simple(out, 400, "Pedido inválido", false);
                return;
            }
            if (req == null) return;
            boolean head = req.method.equals("HEAD");
            if (!head && !req.method.equals("GET")) {
                simple(out, 405, "Solo GET y HEAD", false);
                return;
            }
            serve(s, req, head, out);
        } catch (InterruptedIOException | SocketException e) {
            // El reproductor cerró la conexión (un salto, o se fue): normal.
        } catch (IOException | RuntimeException e) {
            LOG.log(Level.WARNING, "Falló un pedido al motor", e);
        } finally {
            closeQuietly(s);
        }
    }

    private void serve(Socket s, Request req, boolean head, OutputStream out) throws IOException {
        // Ruta: /<token>/<hash>/<idx>
        String[] parts = req.path.split("/", -1);
        if (parts.length != 4 || !parts[0].isEmpty()) {
            simple(out, 404, "No existe", head);
            return;
        }
        if (!sameToken(parts[1])) {
            simple(out, 403, "Prohibido", head);
            return;
        }
        String hash = parts[2].toLowerCase(Locale.ROOT);
        int fileIdx;
        try {
            fileIdx = Integer.parseInt(parts[3]);
        } catch (NumberFormatException e) {
            fileIdx = Integer.MIN_VALUE;
        }
        if (!isHash(hash) || fileIdx == Integer.MIN_VALUE || fileIdx < -1) {
            simple(out, 400, "Hash o archivo inválido", head);
            return;
        }
        List<String> trackers = new ArrayList<>();
        String fileName = null;
        for (String[] kv : req.query) {
            if (kv[0].equals("tr") && trackers.size() < MAX_TRACKERS && validTracker(kv[1])) {
                if (!trackers.contains(kv[1])) trackers.add(kv[1]);
            } else if (kv[0].equals("f") && fileName == null && !kv[1].isEmpty()) {
                fileName = kv[1];
            }
        }

        TorrentEngine.Cancel cancel = () -> clientGone(s);
        TorrentEngine.Selection sel;
        try {
            sel = engine.open(hash, trackers, fileIdx, fileName, cancel);
        } catch (TorrentEngine.EngineException e) {
            simple(out, e.status, e.getMessage(), head);
            return;
        }
        long size = sel.size;
        long start = 0;
        long end = size - 1;
        boolean partial = false;
        if (req.range != null) {
            long[] r = parseRange(req.range, size);
            if (r == null) {
                StringBuilder h = new StringBuilder();
                h.append("HTTP/1.1 416 Range Not Satisfiable\r\n");
                h.append("Content-Range: bytes */").append(size).append("\r\n");
                h.append("Accept-Ranges: bytes\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
                out.flush();
                return;
            }
            if (r.length == 2) {
                start = r[0];
                end = r[1];
                partial = true;
            }
        }
        long length = Math.max(0, end - start + 1);
        StringBuilder h = new StringBuilder();
        h.append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
        h.append("Content-Type: ").append(contentType(sel.name)).append("\r\n");
        h.append("Accept-Ranges: bytes\r\n");
        h.append("Content-Length: ").append(length).append("\r\n");
        if (partial) h.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(size).append("\r\n");
        h.append("Cache-Control: no-store\r\n");
        h.append("Connection: close\r\n\r\n");

        if (head || length == 0) {
            out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
            out.flush();
            return;
        }
        try (TorrentEngine.Reader reader = engine.reader(sel, start)) {
            // Antes de mandar el 200/206 se espera el primer pedazo: si no llega, todavía hay un error claro.
            byte[] buf = new byte[BUFFER];
            long pos = start;
            int n;
            try {
                n = reader.read(pos, buf, 0, (int) Math.min(buf.length, length), cancel);
            } catch (TorrentEngine.EngineException e) {
                simple(out, e.status, e.getMessage(), false);
                return;
            }
            out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
            long left = length;
            while (n > 0) {
                out.write(buf, 0, n);
                pos += n;
                left -= n;
                if (left <= 0) break;
                // Si lo que sigue no está, se manda lo que ya hay mientras se espera.
                out.flush();
                n = reader.read(pos, buf, 0, (int) Math.min(buf.length, left), cancel);
            }
            out.flush();
        }
    }

    // ---------- utilidades ----------

    /** Range de un solo tramo. null = 416; {} = se ignora (sin Range o con varios); {a, b} = tramo. */
    static long[] parseRange(String header, long size) {
        String v = header.trim();
        if (!v.regionMatches(true, 0, "bytes=", 0, 6)) return new long[0];
        v = v.substring(6).trim();
        if (v.contains(",")) return new long[0];
        int dash = v.indexOf('-');
        if (dash < 0) return null;
        String a = v.substring(0, dash).trim();
        String b = v.substring(dash + 1).trim();
        try {
            if (a.isEmpty()) {
                // bytes=-n: los últimos n.
                long n = Long.parseLong(b);
                if (n <= 0 || size == 0) return null;
                return new long[] { Math.max(0, size - n), size - 1 };
            }
            long start = Long.parseLong(a);
            if (start < 0 || start >= size) return null;
            long end = b.isEmpty() ? size - 1 : Math.min(Long.parseLong(b), size - 1);
            if (end < start) return null;
            return new long[] { start, end };
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String contentType(String name) {
        String t = TYPES.get(TorrentEngine.extension(name));
        return t != null ? t : "application/octet-stream";
    }

    static boolean validTracker(String url) {
        String u = url.toLowerCase(Locale.ROOT);
        if (url.length() > 512) return false;
        for (int i = 0; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c <= ' ' || c == 0x7f) return false;
        }
        return u.startsWith("udp://") || u.startsWith("http://") || u.startsWith("https://") || u.startsWith("wss://");
    }

    static boolean isHash(String s) {
        if (s.length() != 40) return false;
        for (int i = 0; i < 40; i++) {
            char c = s.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
        }
        return true;
    }

    private boolean sameToken(String got) {
        return MessageDigest.isEqual(got.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8));
    }

    /** ¿El cliente cerró? (lee sin bloquear: un HTTP/1.1 sin cuerpo no manda nada más). */
    private static boolean clientGone(Socket s) {
        try {
            if (s.isClosed() || s.isInputShutdown()) return true;
            int old = s.getSoTimeout();
            s.setSoTimeout(1);
            try {
                return s.getInputStream().read() == -1;
            } catch (SocketTimeoutException e) {
                return false;
            } finally {
                s.setSoTimeout(old);
            }
        } catch (IOException e) {
            return true;
        }
    }

    private static void simple(OutputStream out, int status, String message, boolean head) throws IOException {
        byte[] body = (message == null ? "" : message).getBytes(StandardCharsets.UTF_8);
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        h.append("Content-Type: text/plain; charset=utf-8\r\n");
        h.append("Content-Length: ").append(body.length).append("\r\n");
        h.append("Cache-Control: no-store\r\n");
        h.append("Connection: close\r\n\r\n");
        out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
        if (!head) out.write(body);
        out.flush();
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 206: return "Partial Content";
            case 400: return "Bad Request";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 410: return "Gone";
            case 416: return "Range Not Satisfiable";
            case 503: return "Service Unavailable";
            case 504: return "Gateway Timeout";
            default: return status >= 500 ? "Internal Server Error" : "Error";
        }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x & 0xff));
        return sb.toString();
    }

    private static void closeQuietly(Socket s) {
        try {
            s.close();
        } catch (IOException ignored) {
            // Nada.
        }
    }

    /** La primera línea y lo que importa de las cabeceras. */
    static final class Request {
        String method;
        String path;
        String range;
        final List<String[]> query = new ArrayList<>();

        /** null si la conexión se cerró sin mandar nada. */
        static Request parse(InputStream in) throws IOException {
            byte[] buf = new byte[MAX_HEADER_BYTES];
            int len = 0;
            // Lee hasta la línea vacía (\r\n\r\n o \n\n), de a un byte: son pocos y no hay cuerpo.
            while (true) {
                int c = in.read();
                if (c < 0) {
                    if (len == 0) return null;
                    throw new IOException("Cabeceras cortadas");
                }
                if (len == buf.length) throw new IOException("Cabeceras muy largas");
                buf[len++] = (byte) c;
                if (len >= 2 && buf[len - 1] == '\n' && (buf[len - 2] == '\n' || (len >= 4 && buf[len - 2] == '\r' && buf[len - 3] == '\n'))) break;
            }
            String text = new String(buf, 0, len, StandardCharsets.ISO_8859_1);
            String[] lines = text.split("\r?\n");
            String[] first = lines[0].split(" ");
            if (first.length != 3 || !first[2].startsWith("HTTP/")) throw new IOException("Primera línea inválida");
            Request r = new Request();
            r.method = first[0].toUpperCase(Locale.ROOT);
            String target = first[1];
            int q = target.indexOf('?');
            r.path = q < 0 ? target : target.substring(0, q);
            if (q >= 0) {
                for (String pair : target.substring(q + 1).split("&")) {
                    if (pair.isEmpty()) continue;
                    int eq = pair.indexOf('=');
                    String k = decode(eq < 0 ? pair : pair.substring(0, eq));
                    String v = eq < 0 ? "" : decode(pair.substring(eq + 1));
                    r.query.add(new String[] { k, v });
                }
            }
            for (int i = 1; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon <= 0) continue;
                if (lines[i].substring(0, colon).trim().equalsIgnoreCase("range")) r.range = lines[i].substring(colon + 1).trim();
            }
            return r;
        }

        private static String decode(String s) throws IOException {
            try {
                return URLDecoder.decode(s, "UTF-8");
            } catch (IllegalArgumentException e) {
                throw new IOException("Parámetro mal codificado");
            }
        }
    }

    /** Para pruebas: arranca motor + servidor en una carpeta. */
    static TorrentServer create(File root, TorrentEngine.Options options) throws IOException {
        return new TorrentServer(new TorrentEngine(root, options));
    }
}
