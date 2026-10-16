package ar.flix.tv;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Enlaces "flix://open?path=…&profile=…" (v0.21): los usan las filas del inicio de la TV
 * ("A continuación") para abrir una ficha. Cualquier app instalada puede mandar este intent
 * (el filtro no es BROWSABLE, así que una página web no), por eso se valida todo y lo que no cierra
 * se ignora: solo se aceptan rutas propias de la app, nunca una URL de afuera.
 */
final class DeepLink {

    static final String SCHEME = "flix";
    static final String HOST = "open";

    private static final int MAX_PATH = 500;
    private static final Pattern PATH_CHARS = Pattern.compile("^[A-Za-z0-9/_\\-.%?=&:]+$");
    private static final Pattern PROFILE = Pattern.compile("^[A-Za-z0-9_-]{1,40}$");

    /** Lo que se le pasa a la web con takeLaunch(). */
    static final class Launch {
        final String path;
        final String profile; // puede ser null: la web sigue con el perfil activo

        Launch(String path, String profile) {
            this.path = path;
            this.profile = profile;
        }
    }

    // El último enlace válido que la web todavía no levantó. Lo escribe el hilo de la interfaz
    // (onCreate / onNewIntent) y lo lee el hilo de los plugins (takeLaunch).
    private static Launch pending;

    private DeepLink() {}

    /** Si el intent trae un enlace válido, queda pendiente y devuelve true. */
    static boolean offer(Intent intent) {
        Launch l = parse(intent);
        if (l == null) return false;
        synchronized (DeepLink.class) {
            pending = l;
        }
        return true;
    }

    /** Devuelve el enlace pendiente y lo borra (una sola vez por enlace). */
    static Launch take() {
        synchronized (DeepLink.class) {
            Launch l = pending;
            pending = null;
            return l;
        }
    }

    static Launch parse(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        // Abrir la app desde "recientes" repite el último intent: ese enlace ya se usó.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return null;
        Uri uri = intent.getData();
        if (uri == null || !SCHEME.equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return null;
        if (uri.getPort() != -1 || uri.getUserInfo() != null) return null;
        String rawPath = uri.getPath();
        if (rawPath != null && !rawPath.isEmpty() && !"/".equals(rawPath)) return null;
        String path;
        String profile;
        try {
            path = uri.getQueryParameter("path");
            profile = uri.getQueryParameter("profile");
        } catch (RuntimeException e) {
            return null; // URI opaca o mal armada
        }
        if (!validPath(path)) return null;
        if (profile != null && !validProfile(profile)) return null;
        return new Launch(path, profile);
    }

    static boolean validPath(String path) {
        if (path == null || path.isEmpty() || path.length() > MAX_PATH) return false;
        if (!path.startsWith("/") || path.startsWith("//")) return false;
        if (!PATH_CHARS.matcher(path).matches()) return false;
        if (!path.startsWith("/detail/")) return false;
        // Sin "." ni ".." como tramo de la ruta: que nadie salga de /detail/ con /detail/../algo.
        int q = path.indexOf('?');
        String route = q >= 0 ? path.substring(0, q) : path;
        for (String seg : route.split("/", -1)) {
            if (".".equals(seg) || "..".equals(seg)) return false;
        }
        String lower = route.toLowerCase(Locale.ROOT);
        return !lower.contains("%2e") && !lower.contains("%2f");
    }

    static boolean validProfile(String profile) {
        return profile != null && PROFILE.matcher(profile).matches();
    }

    /** El URI del enlace (sin validar: lo arma la app con datos que ya pasaron por validPath). */
    static Uri uri(String path, String profile) {
        Uri.Builder b = new Uri.Builder().scheme(SCHEME).authority(HOST).appendQueryParameter("path", path);
        if (profile != null) b.appendQueryParameter("profile", profile);
        return b.build();
    }

    /** Intent explícito a MainActivity con el enlace (para las filas del inicio). */
    static Intent intent(Context ctx, String path, String profile) {
        Intent i = new Intent(Intent.ACTION_VIEW, uri(path, profile));
        i.setClass(ctx, MainActivity.class);
        return i;
    }
}
