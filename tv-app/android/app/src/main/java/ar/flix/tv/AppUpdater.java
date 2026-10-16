package ar.flix.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Se actualiza solo (v0.21) desde GitHub Releases, el mismo lugar de donde se baja con Downloader.
 *
 * Mira la última versión (como mucho una vez cada 6 h), baja el APK, comprueba que sea esta misma app
 * (nombre de paquete, versión más nueva y la misma firma que la instalada) y abre el instalador de
 * Android: el usuario solo toca "Instalar". La red y los archivos van en un hilo aparte; el avance
 * llega a la web con el evento `update`.
 */
final class AppUpdater {

    interface Events {
        void emit(JSObject event);
    }

    private static final String TAG = "SpUpdater";
    private static final String API = "https://api.github.com/repos/FedeSierra-ux/Series-Pelis/releases/latest";
    private static final String DOWNLOAD_PREFIX = "/fedesierra-ux/series-pelis/releases/download/";
    private static final String ASSET = "flix-tv.apk";
    private static final Pattern TAG_RE = Pattern.compile("^flix-v(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");
    private static final long CHECK_EVERY_MS = 6L * 60 * 60 * 1000;
    private static final long ERROR_RETRY_MS = 15L * 60 * 1000;
    private static final long MAX_APK = 200L * 1024 * 1024;
    private static final int MAX_JSON = 1024 * 1024;
    private static final int MAX_NOTES = 1500;
    private static final int MAX_REDIRECTS = 5;
    private static final long PROGRESS_EVERY_MS = 250;
    private static final long PENDING_MAX_AGE_MS = 60L * 60 * 1000;
    private static final String PREFS = "sp_updater";

    private final Context ctx;
    private final Events events;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    // Descarga/instalación en un hilo y la consulta en otro: mirar si hay versión nueva no espera a
    // que termine una descarga.
    private final ExecutorService worker = Executors.newSingleThreadExecutor((r) -> new Thread(r, "sp-updater"));
    private final ExecutorService checker = Executors.newSingleThreadExecutor((r) -> new Thread(r, "sp-update-check"));
    // Una descarga a la vez: un segundo "Actualizar" mientras corre la primera no hace nada.
    private final AtomicBoolean running = new AtomicBoolean(false);

    AppUpdater(Context ctx, Events events) {
        this.ctx = ctx.getApplicationContext();
        this.events = events;
        this.prefs = this.ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private File dir() {
        return new File(ctx.getCacheDir(), "updates");
    }

    private File apk() {
        return new File(dir(), ASSET);
    }

    // ───────────────────────── al abrir la app ─────────────────────────

    /**
     * Borra lo que quedó de otras descargas. Si había una instalación esperando el permiso (Android
     * pudo cerrar la app mientras el usuario estaba en Ajustes), el APK se guarda un rato más.
     */
    void cleanupOnStart() {
        worker.execute(() -> {
            long pendingAt = prefs.getLong("pendingAt", 0);
            boolean keep = pendingAt > 0 && System.currentTimeMillis() - pendingAt < PENDING_MAX_AGE_MS && apk().isFile();
            File[] files = dir().listFiles();
            if (files != null) {
                for (File f : files) {
                    if (keep && f.getName().equals(ASSET)) continue;
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
            if (!keep) prefs.edit().remove("pendingAt").apply();
        });
    }

    // ───────────────────────── buscar versión nueva ─────────────────────────

    interface Result {
        void done(JSObject info);
    }

    /** Nunca falla: si no se pudo mirar, `error` dice por qué (en castellano). */
    void check(boolean force, Result result) {
        try {
            checker.execute(() -> {
                JSObject out;
                try {
                    out = checkNow(force);
                } catch (Throwable e) {
                    Log.w(TAG, "check", e);
                    out = checkError();
                }
                result.done(out);
            });
        } catch (RuntimeException e) {
            result.done(checkError());
        }
    }

    private JSObject checkError() {
        JSObject o = base();
        o.put("available", false);
        o.put("error", "No se pudo buscar actualizaciones");
        return o;
    }

    private JSObject base() {
        JSObject o = new JSObject();
        o.put("current", BuildConfig.VERSION_NAME);
        return o;
    }

    private JSObject checkNow(boolean force) {
        long now = System.currentTimeMillis();
        long at = prefs.getLong("checkedAt", 0);
        String cached = prefs.getString("release", null);
        String cachedError = prefs.getString("error", null);
        boolean fresh = at > 0 && at <= now;
        if (!force && fresh && cached != null && now - at < CHECK_EVERY_MS) {
            try {
                return fromRelease(new JSONObject(cached));
            } catch (Exception ignored) {
                // Caché rota: se mira de nuevo.
            }
        }
        if (!force && fresh && cached == null && cachedError != null && now - at < ERROR_RETRY_MS) {
            JSObject o = base();
            o.put("available", false);
            o.put("error", cachedError);
            return o;
        }
        try {
            JSONObject release = fetchRelease();
            prefs.edit().putLong("checkedAt", now).putString("release", release.toString()).remove("error").apply();
            return fromRelease(release);
        } catch (UpdateError e) {
            prefs.edit().putLong("checkedAt", now).remove("release").putString("error", e.getMessage()).apply();
            JSObject o = base();
            o.put("available", false);
            o.put("error", e.getMessage());
            return o;
        }
    }

    /** El release ya filtrado: {latest, code, notes, size, url}. */
    private JSObject fromRelease(JSONObject r) {
        JSObject o = base();
        long code = r.optLong("code");
        boolean newer = code > BuildConfig.VERSION_CODE && isNewer(r.optString("latest"), BuildConfig.VERSION_NAME);
        o.put("available", newer);
        o.put("latest", r.optString("latest"));
        if (r.has("notes")) o.put("notes", r.optString("notes"));
        if (r.has("size")) o.put("size", r.optLong("size"));
        return o;
    }

    private JSONObject fetchRelease() throws UpdateError {
        String body;
        try {
            body = getText(API);
        } catch (UpdateError e) {
            throw e;
        } catch (IOException e) {
            throw new UpdateError("Sin conexión con GitHub. Probá de nuevo más tarde.");
        }
        try {
            JSONObject json = new JSONObject(body);
            String tag = json.optString("tag_name", "");
            Matcher m = TAG_RE.matcher(tag);
            if (!m.matches() || json.optBoolean("draft") || json.optBoolean("prerelease")) {
                throw new UpdateError("La última publicación no es una versión de la app de TV");
            }
            int major = Integer.parseInt(m.group(1));
            int minor = Integer.parseInt(m.group(2));
            int patch = Integer.parseInt(m.group(3));
            JSONArray assets = json.optJSONArray("assets");
            JSONObject asset = null;
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject a = assets.optJSONObject(i);
                    if (a != null && ASSET.equals(a.optString("name"))) {
                        asset = a;
                        break;
                    }
                }
            }
            if (asset == null) throw new UpdateError("La versión nueva todavía no tiene el APK");
            String url = asset.optString("browser_download_url", "");
            if (!isReleaseDownload(url)) throw new UpdateError("El enlace de descarga no es de GitHub");
            JSONObject out = new JSONObject();
            out.put("latest", major + "." + minor + "." + patch);
            out.put("code", major * 1_000_000L + minor * 1_000L + patch);
            out.put("url", url);
            long size = asset.optLong("size", 0);
            if (size > 0) out.put("size", size);
            String notes = json.optString("body", "").trim();
            if (json.isNull("body")) notes = "";
            if (!notes.isEmpty()) out.put("notes", notes.length() > MAX_NOTES ? notes.substring(0, MAX_NOTES) + "…" : notes);
            return out;
        } catch (UpdateError e) {
            throw e;
        } catch (Exception e) {
            throw new UpdateError("GitHub contestó algo raro. Probá de nuevo más tarde.");
        }
    }

    /** "0.21.0" > "0.20.3", parte por parte y como números. */
    static boolean isNewer(String latest, String current) {
        int[] a = parts(latest);
        int[] b = parts(current);
        if (a == null) return false;
        if (b == null) return true;
        for (int i = 0; i < 3; i++) {
            if (a[i] != b[i]) return a[i] > b[i];
        }
        return false;
    }

    private static int[] parts(String v) {
        if (v == null) return null;
        Matcher m = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})").matcher(v);
        if (!m.find()) return null;
        return new int[] { Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)) };
    }

    /** El enlace del asset tiene que ser https://github.com/FedeSierra-ux/Series-Pelis/releases/download/… */
    private static boolean isReleaseDownload(String url) {
        try {
            URL u = new URL(url);
            return (
                "https".equals(u.getProtocol()) &&
                "github.com".equalsIgnoreCase(u.getHost()) &&
                (u.getPort() == -1 || u.getPort() == 443) &&
                u.getUserInfo() == null &&
                u.getPath().toLowerCase(Locale.ROOT).startsWith(DOWNLOAD_PREFIX)
            );
        } catch (Exception e) {
            return false;
        }
    }

    /** github.com o *.githubusercontent.com por https (también en cada redirección de la descarga). */
    static boolean allowedDownloadHost(URL u) {
        if (!"https".equals(u.getProtocol()) || u.getUserInfo() != null) return false;
        if (u.getPort() != -1 && u.getPort() != 443) return false;
        String host = u.getHost().toLowerCase(Locale.ROOT);
        return host.equals("github.com") || host.equals("objects.githubusercontent.com") || host.endsWith(".githubusercontent.com");
    }

    // ───────────────────────── bajar e instalar ─────────────────────────

    /** Arranca la descarga (o retoma una instalación). El resultado llega por el evento `update`. */
    void install(Activity activity) {
        if (!running.compareAndSet(false, true)) return; // ya hay una en curso: sus eventos siguen llegando
        try {
            worker.execute(() -> {
                try {
                    installNow(activity);
                } catch (UpdateError e) {
                    fail(e.getMessage());
                } catch (Throwable e) {
                    Log.w(TAG, "install", e);
                    fail("No se pudo actualizar la app");
                } finally {
                    running.set(false);
                }
            });
        } catch (RuntimeException e) {
            running.set(false);
            fail("No se pudo actualizar la app");
        }
    }

    private void installNow(Activity activity) throws UpdateError {
        JSONObject release;
        try {
            String cached = prefs.getString("release", null);
            long at = prefs.getLong("checkedAt", 0);
            release = cached != null && System.currentTimeMillis() - at < CHECK_EVERY_MS ? new JSONObject(cached) : null;
        } catch (Exception e) {
            release = null;
        }
        if (release == null) {
            release = fetchRelease();
            prefs.edit().putLong("checkedAt", System.currentTimeMillis()).putString("release", release.toString()).remove("error").apply();
        }
        long code = release.optLong("code");
        if (code <= BuildConfig.VERSION_CODE || !isNewer(release.optString("latest"), BuildConfig.VERSION_NAME)) {
            throw new UpdateError("Ya tenés la última versión");
        }
        String url = release.optString("url", "");
        if (!isReleaseDownload(url)) throw new UpdateError("El enlace de descarga no es de GitHub");

        prefs.edit().remove("pendingAt").remove("askedPermission").apply();
        File file = apk();
        if (alreadyDownloaded(file, code)) {
            // Se bajó antes (por ejemplo, se canceló el instalador): no hace falta bajarla de nuevo.
            emit(progress(1));
            emit(state("verifying"));
        } else {
            download(url, release.optLong("size", 0), file);
            emit(state("verifying"));
            verify(file);
        }
        prefs.edit().putLong("pendingAt", System.currentTimeMillis()).apply();
        openInstallerOrAskPermission(activity, file);
    }

    private void download(String url, long expected, File target) throws UpdateError {
        File dir = target.getParentFile();
        if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new UpdateError("No hay lugar para bajar la actualización");
        File tmp = new File(dir, ASSET + ".part");
        //noinspection ResultOfMethodCallIgnored
        tmp.delete();
        //noinspection ResultOfMethodCallIgnored
        target.delete();
        if (expected > MAX_APK) throw new UpdateError("La actualización es demasiado grande");
        emit(progress(0));
        HttpURLConnection conn = null;
        try {
            conn = open(url, true);
            long length = conn.getContentLengthLong();
            if (length > MAX_APK) throw new UpdateError("La actualización es demasiado grande");
            if (expected > 0 && length > 0 && length != expected) throw new UpdateError("La descarga no coincide con la publicada");
            long total = length > 0 ? length : expected;
            long done = 0;
            long lastEmit = SystemClock.elapsedRealtime();
            byte[] buf = new byte[64 * 1024];
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                int n;
                while ((n = in.read(buf)) != -1) {
                    done += n;
                    if (done > MAX_APK) throw new UpdateError("La actualización es demasiado grande");
                    out.write(buf, 0, n);
                    long t = SystemClock.elapsedRealtime();
                    if (total > 0 && t - lastEmit >= PROGRESS_EVERY_MS) {
                        lastEmit = t;
                        emit(progress(Math.min(1.0, (double) done / total)));
                    }
                }
            }
            if (total > 0 && done != total) throw new UpdateError("La descarga quedó cortada. Probá de nuevo.");
            emit(progress(1));
            if (!tmp.renameTo(target)) throw new UpdateError("No se pudo guardar la actualización");
        } catch (UpdateError e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw e;
        } catch (IOException e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw new UpdateError("Se cortó la descarga. Revisá la conexión y probá de nuevo.");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** ¿El APK que quedó en la caché es justo esta versión y pasa la verificación? */
    private boolean alreadyDownloaded(File file, long code) {
        if (!file.isFile()) return false;
        try {
            verifyOrThrow(file);
            PackageInfo p = ctx.getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), 0);
            if (p != null && versionCode(p) == code) return true;
        } catch (Exception ignored) {
            // No sirve: se baja de nuevo.
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
        return false;
    }

    /** Que sea esta app, más nueva y firmada con la misma llave. Si no, se borra. */
    private void verify(File file) throws UpdateError {
        try {
            verifyOrThrow(file);
        } catch (UpdateError e) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            throw e;
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            throw new UpdateError("No se pudo comprobar la actualización");
        }
    }

    @SuppressWarnings("deprecation")
    private void verifyOrThrow(File file) throws Exception {
        PackageManager pm = ctx.getPackageManager();
        String pkg = ctx.getPackageName();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo apk = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (apk == null) throw new UpdateError("El archivo bajado no es un APK válido");
        if (!pkg.equals(apk.packageName)) throw new UpdateError("El APK bajado es de otra app");
        PackageInfo installed = pm.getPackageInfo(pkg, flags);
        if (versionCode(apk) <= versionCode(installed)) throw new UpdateError("El APK bajado no es más nuevo que el instalado");
        Set<String> a = signers(apk);
        Set<String> b = signers(installed);
        if (a.isEmpty() || b.isEmpty()) throw new UpdateError("No se pudo leer la firma de la actualización");
        if (!a.equals(b)) {
            throw new UpdateError(
                "La actualización está firmada con otra llave. Si esta app es una versión de prueba (debug), " +
                "desinstalala e instalá la del Release de GitHub."
            );
        }
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo p) {
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    /** SHA-256 de cada certificado de firma. */
    @SuppressWarnings("deprecation")
    private static Set<String> signers(PackageInfo p) throws Exception {
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= 28) {
            SigningInfo si = p.signingInfo;
            if (si != null) sigs = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
        } else {
            sigs = p.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) {
            if (s == null) continue;
            byte[] d = md.digest(s.toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format(Locale.ROOT, "%02x", x));
            out.add(sb.toString());
        }
        return out;
    }

    private void openInstallerOrAskPermission(Activity activity, File file) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            emit(state("permission"));
            prefs.edit().putBoolean("askedPermission", true).apply();
            main.post(() -> {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
                try {
                    if (activity == null || activity.isFinishing()) throw new ActivityNotFoundException();
                    activity.startActivity(i);
                } catch (ActivityNotFoundException | SecurityException e) {
                    prefs.edit().remove("askedPermission").apply();
                    fail(manualPermissionText());
                }
            });
            return;
        }
        main.post(() -> startInstaller(activity, file));
    }

    /**
     * Al volver de Ajustes: si dio el permiso, sigue sola al instalador; si no, avisa. Se llama
     * desde handleOnResume (hilo de la interfaz).
     */
    void onResume(Activity activity) {
        if (!prefs.getBoolean("askedPermission", false)) return;
        worker.execute(() -> {
            if (!prefs.getBoolean("askedPermission", false) || running.get()) return;
            prefs.edit().remove("askedPermission").apply();
            File file = apk();
            if (prefs.getLong("pendingAt", 0) == 0 || !file.isFile()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
                prefs.edit().remove("pendingAt").apply();
                fail("Sin el permiso para instalar apps no se puede actualizar. " + manualPermissionText());
                return;
            }
            try {
                // El archivo se vuelve a revisar: pudo pasar un rato (o la app se reinició).
                verify(file);
            } catch (UpdateError e) {
                prefs.edit().remove("pendingAt").apply();
                fail(e.getMessage());
                return;
            }
            main.post(() -> startInstaller(activity, file));
        });
    }

    private void startInstaller(Activity activity, File file) {
        prefs.edit().remove("pendingAt").remove("askedPermission").apply();
        try {
            if (activity == null || activity.isFinishing()) throw new IllegalStateException("sin actividad");
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", file);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            emit(state("installer"));
            activity.startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "installer", e);
            fail("No se pudo abrir el instalador de Android");
        }
    }

    private String manualPermissionText() {
        if (HomeRows.isFireTv(ctx)) {
            return "Activalo a mano en Configuración → Mi Fire TV → Opciones para desarrolladores → Instalar apps desconocidas → Flix.";
        }
        return "Activalo a mano en Ajustes → Apps → Acceso especial → Instalar apps desconocidas → Flix.";
    }

    // ───────────────────────── red ─────────────────────────

    /** GET de la API de GitHub: solo api.github.com, sin token y con tope de tamaño. */
    private String getText(String url) throws IOException, UpdateError {
        HttpURLConnection conn = open(url, false);
        try (InputStream in = conn.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                if (out.size() + n > MAX_JSON) throw new UpdateError("GitHub contestó algo raro. Probá de nuevo más tarde.");
                out.write(buf, 0, n);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            conn.disconnect();
        }
    }

    /**
     * Abre la conexión siguiendo las redirecciones a mano, para revisar el destino de cada salto:
     * la API solo puede ir a api.github.com y la descarga solo a github.com / *.githubusercontent.com.
     */
    private HttpURLConnection open(String start, boolean download) throws IOException, UpdateError {
        URL url = new URL(start);
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            boolean ok = download ? allowedDownloadHost(url) : isApiHost(url);
            if (!ok) throw new UpdateError(download ? "La descarga quiso salir de GitHub" : "GitHub redirigió a otro sitio");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15_000);
            c.setReadTimeout(30_000);
            c.setRequestProperty("User-Agent", "FlixApp/" + BuildConfig.VERSION_NAME);
            c.setRequestProperty("Accept", download ? "application/octet-stream" : "application/vnd.github+json");
            if (!download) c.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && code != 304) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new IOException("redirección sin destino");
                url = new URL(url, loc);
                continue;
            }
            if (code == 200) return c;
            c.disconnect();
            if (!download && (code == 403 || code == 429)) {
                throw new UpdateError("GitHub limitó las consultas por un rato. Probá más tarde.");
            }
            if (code == 404) {
                throw new UpdateError(
                    download ? "No se encontró el APK de la versión nueva" : "No hay versiones publicadas en GitHub (o el repositorio es privado)"
                );
            }
            throw new IOException("HTTP " + code);
        }
        throw new UpdateError("Demasiadas redirecciones");
    }

    private static boolean isApiHost(URL u) {
        return (
            "https".equals(u.getProtocol()) &&
            "api.github.com".equalsIgnoreCase(u.getHost()) &&
            (u.getPort() == -1 || u.getPort() == 443) &&
            u.getUserInfo() == null
        );
    }

    // ───────────────────────── eventos ─────────────────────────

    private static JSObject state(String s) {
        JSObject o = new JSObject();
        o.put("state", s);
        return o;
    }

    private static JSObject progress(double p) {
        JSObject o = state("downloading");
        o.put("progress", p);
        return o;
    }

    private void fail(String message) {
        JSObject o = state("error");
        o.put("message", message);
        emit(o);
    }

    private void emit(JSObject e) {
        try {
            events.emit(e);
        } catch (Exception ignored) {
            // La web puede no estar escuchando: no es un error del updater.
        }
    }

    /** Error con un mensaje para mostrar tal cual. */
    static final class UpdateError extends Exception {

        UpdateError(String message) {
            super(message);
        }
    }
}
