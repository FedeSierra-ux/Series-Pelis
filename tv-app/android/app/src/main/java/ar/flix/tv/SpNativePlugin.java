package ar.flix.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.WindowManager;
import android.widget.Toast;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.net.URISyntaxException;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Lo que la web le pide a la app (en JS: window.Capacitor.Plugins.SpNative). */
@CapacitorPlugin(name = "SpNative")
public class SpNativePlugin extends Plugin {

    private static final String TAG = "SpNative";

    // Reproductor nativo (v0.20): se crea con el primer playerOpen y vive en el hilo de la interfaz.
    private NativePlayer player;
    // Actualizaciones desde GitHub Releases (v0.21).
    private AppUpdater updater;
    // Motor de torrents (v0.25): se arma en otro hilo al cargar (loadLibrary tarda y no puede frenar el
    // arranque de la app); libtorrent en sí arranca con el primer pedido. Volatile: lo escribe ese hilo.
    private volatile TorrentServer torrent;
    // Se suelta cuando terminó de armarse (haya motor o no).
    private final CountDownLatch torrentReady = new CountDownLatch(1);
    private volatile boolean destroyed;
    // Cuánto espera getInfo al motor antes de contestar `torrentLoading` (la web pregunta de nuevo
    // o espera el aviso "torrentReady").
    private static final long INFO_WAIT_MS = 1_500;
    // En el fondo más de 5 minutos: se da el video por cerrado (el motor suelta los torrents al rato).
    private static final long BACKGROUND_CLOSE_MS = 5 * 60_000;
    private final Handler main = new Handler(Looper.getMainLooper());
    // Ya se avisó el cierre por estar en el fondo (solo en el hilo de la interfaz).
    private boolean backgroundClosed;
    private final Runnable backgroundClose = () -> {
        TorrentServer t = torrent;
        if (t != null) {
            Log.i(TAG, "Cinco minutos en el fondo: se sueltan los torrents");
            t.engine().playerClosed();
            backgroundClosed = true;
        }
    };

    @Override
    public void load() {
        updater = new AppUpdater(getContext(), (e) -> notifyListeners("update", e));
        updater.cleanupOnStart();
        Thread start = new Thread(() -> {
            try {
                startTorrentServer();
                // Si la actividad se destruyó mientras tanto, nadie más lo va a cerrar.
                if (destroyed) {
                    TorrentServer t = takeTorrent();
                    if (t != null) {
                        t.shutdown();
                        t.engine().stop();
                    }
                }
            } finally {
                torrentReady.countDown();
            }
            // La web que preguntó mientras arrancaba (getInfo con `torrentLoading`) se entera acá.
            // Se guarda hasta que alguien escuche: puede registrarse un momento después.
            if (!destroyed) {
                JSObject ev = new JSObject();
                TorrentServer t = torrent;
                if (t != null) ev.put("torrent", t.baseUrl());
                notifyListeners("torrentReady", ev, true);
            }
        }, "sp-torrent-start");
        start.setDaemon(true);
        start.start();
    }

    /**
     * Si falta la librería de libtorrent para este aparato, o no linkea, no hay motor (la web no ve
     * `torrent`). La .so de libtorrent4j se compiló para Android 9 (usa aligned_alloc de API 28): en
     * Android 7/8 (Fire OS 6, por ejemplo) loadLibrary falla y la app sigue como siempre.
     */
    private void startTorrentServer() {
        String libDir = getContext().getApplicationInfo().nativeLibraryDir;
        if (libDir == null || !new File(libDir, "libtorrent4j.so").isFile()) {
            Log.w(TAG, "Sin libtorrent4j para este aparato: no hay motor de torrents");
            return;
        }
        try {
            // Se carga ya: mejor no ofrecer torrents que fallar recién al darle a reproducir.
            System.loadLibrary("torrent4j");
            File root = new File(getContext().getCacheDir(), "torrents");
            torrent = new TorrentServer(new TorrentEngine(root, new TorrentEngine.Options()));
        } catch (Throwable e) {
            Log.w(TAG, "No arrancó el servidor de torrents", e);
            torrent = null;
        }
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject res = new JSObject();
        res.put("tv", MainActivity.isTv(getContext()));
        res.put("version", BuildConfig.VERSION_NAME);
        res.put("player", true);
        // v0.21: un APK viejo no manda estas claves, y la web lo toma como "no lo tiene".
        res.put("update", true);
        res.put("home", HomeRows.isAvailable(getContext()));
        res.put("fireTv", HomeRows.isFireTv(getContext()));
        // v0.25: base del motor de torrents (http://127.0.0.1:<puerto>/<token>); sin motor, no va.
        if (torrentReady.getCount() == 0) {
            resolveInfo(call, res);
            return;
        }
        // Todavía se está armando: se espera un poco en otro hilo (nunca en el de la interfaz).
        Thread wait = new Thread(() -> {
            try {
                torrentReady.await(INFO_WAIT_MS, TimeUnit.MILLISECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            resolveInfo(call, res);
        }, "sp-torrent-info");
        wait.setDaemon(true);
        wait.start();
    }

    /** Lo saca una sola vez: el hilo de arranque y onDestroy pueden querer cerrarlo a la vez. */
    private synchronized TorrentServer takeTorrent() {
        TorrentServer t = torrent;
        torrent = null;
        return t;
    }

    /**
     * Con motor, `torrent`; si todavía se está armando, `torrentLoading` (no es "este APK no tiene
     * motor": la web no tiene que guardarse esa respuesta ni pedir que se actualice la app).
     */
    private void resolveInfo(PluginCall call, JSObject res) {
        // Primero el latch y después el campo: countDown va después de escribir `torrent`, así que
        // con el latch en 0 el campo ya está (o no va a estar nunca).
        boolean loading = torrentReady.getCount() > 0;
        TorrentServer t = torrent;
        if (t != null) res.put("torrent", t.baseUrl());
        else if (loading && !destroyed) res.put("torrentLoading", true);
        call.resolve(res);
    }

    // ───────────────────────── actualizaciones (v0.21) ─────────────────────────

    /** ¿Hay una versión nueva en GitHub? Nunca falla por la red: lo dice en `error`. */
    @PluginMethod
    public void updateCheck(PluginCall call) {
        boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));
        updater.check(force, call::resolve);
    }

    /** Arranca la descarga y la instalación; el avance va por el evento `update`. */
    @PluginMethod
    public void updateInstall(PluginCall call) {
        updater.install(getActivity());
        call.resolve();
    }

    // ───────────────────────── inicio de la TV (v0.21) ─────────────────────────

    /** Todo lo de "A continuación" del perfil activo; acá se compara con lo publicado. */
    @PluginMethod
    public void homeSync(PluginCall call) {
        if (!HomeRows.isAvailable(getContext())) {
            call.resolve();
            return;
        }
        HomeRows.sync(getContext(), call.getData(), call::resolve);
    }

    /** El enlace con el que se abrió la app desde el inicio de la TV (una sola vez; si no hay, vacío). */
    @PluginMethod
    public void takeLaunch(PluginCall call) {
        JSObject res = new JSObject();
        DeepLink.Launch l = DeepLink.take();
        if (l != null) {
            res.put("path", l.path);
            if (l.profile != null) res.put("profile", l.profile);
        }
        call.resolve(res);
    }

    /** MainActivity avisa que llegó un enlace nuevo con la app abierta: la web llama a takeLaunch. */
    void notifyOpen() {
        notifyListeners("open", new JSObject());
    }

    /** Para MainActivity (teclas y Atrás). Solo desde el hilo de la interfaz. */
    NativePlayer player() {
        return player;
    }

    private NativePlayer ensurePlayer() {
        if (player == null) {
            // Proveedor y no el servidor: puede terminar de armarse después de crear el reproductor.
            player = new NativePlayer(getActivity(), getBridge().getWebView(), () -> torrent, (e) -> notifyListeners("player", e));
        }
        return player;
    }

    /** Abre el video encima de la web (o cambia el que se está viendo). */
    @PluginMethod
    public void playerOpen(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL del video");
            return;
        }
        JSObject data = call.getData();
        getActivity().runOnUiThread(() -> {
            try {
                ensurePlayer().open(data);
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo abrir el reproductor", e);
            }
        });
    }

    /** Datos que la web va sabiendo después de abrir: intro, siguiente episodio, subtítulos… */
    @PluginMethod
    public void playerUpdate(PluginCall call) {
        JSObject data = call.getData();
        getActivity().runOnUiThread(() -> {
            if (player != null && player.isOpen()) player.update(data);
            call.resolve();
        });
    }

    /** El VTT de un subtítulo externo. Se lee acá (fuera del hilo de la interfaz) y después se muestra. */
    @PluginMethod
    public void playerSubtitleData(PluginCall call) {
        String id = call.getString("id");
        String vtt = call.getString("vtt");
        if (id == null || vtt == null) {
            call.reject("Faltan el id o el texto del subtítulo");
            return;
        }
        List<VttParser.Cue> cues = VttParser.parse(vtt);
        getActivity().runOnUiThread(() -> {
            if (player != null && player.isOpen()) player.subtitleData(id, cues);
            call.resolve();
        });
    }

    /** Cierre pedido por la web: no manda "closed". */
    @PluginMethod
    public void playerClose(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (player != null) player.close();
            call.resolve();
        });
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Volvió de Ajustes con el permiso para instalar: sigue sola al instalador.
        if (updater != null) updater.onResume(getActivity());
        main.removeCallbacks(backgroundClose);
        TorrentServer t = torrent;
        if (t != null) {
            t.engine().resume();
            // Volvió después de los 5 minutos con el video del motor todavía abierto: la limpieza que
            // dejó programada playerClosed borraría lo que se está viendo.
            if (backgroundClosed && player != null && player.playingTorrent()) t.engine().playerReopened();
        }
        backgroundClosed = false;
        if (player != null) player.onHostResume();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (player != null) player.onHostPause();
    }

    /**
     * La app quedó tapada del todo (otra app, inicio de la TV): se pausan los torrents (sin bajar ni
     * subir) y, si tarda más de 5 minutos en volver, se da el video por cerrado. En onPause no: un
     * diálogo encima no tiene por qué cortar los pares.
     */
    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        if (player != null) player.onHostStop();
        TorrentServer t = torrent;
        if (t != null) {
            t.engine().pause();
            main.removeCallbacks(backgroundClose);
            main.postDelayed(backgroundClose, BACKGROUND_CLOSE_MS);
        }
    }

    /** Cómo va un torrent del motor: pares, velocidad, avance. Sin motor o sin ese torrent, vacío. */
    @PluginMethod
    public void torrentStatus(PluginCall call) {
        JSObject res = new JSObject();
        String hash = call.getString("hash", "");
        TorrentServer t = torrent;
        TorrentEngine.Status st = t != null && hash != null ? t.engine().status(hash.toLowerCase(java.util.Locale.ROOT)) : null;
        if (st != null) {
            res.put("metadata", st.metadata);
            res.put("peers", st.peers);
            res.put("seeds", st.seeds);
            res.put("downloadRate", st.downloadRate);
            res.put("progress", (double) st.progress);
        }
        call.resolve(res);
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        main.removeCallbacks(backgroundClose);
        if (player != null) player.onHostDestroy();
        player = null;
        TorrentServer t = takeTorrent();
        if (t != null) {
            // Parar libtorrent tarda (cierra conexiones y borra la caché): en otro hilo.
            t.shutdown();
            Thread stop = new Thread(() -> t.engine().stop(), "sp-torrent-stop");
            stop.setDaemon(true);
            stop.start();
        }
        super.handleOnDestroy();
    }

    /** Pantalla siempre prendida mientras se reproduce (el WebView no tiene Wake Lock). */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        Activity act = getActivity();
        act.runOnUiThread(() -> {
            if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    /** "Atrás" en Inicio: la app va al fondo (queda abierta, como Netflix o YouTube). */
    @PluginMethod
    public void exitApp(PluginCall call) {
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
        call.resolve();
    }

    /**
     * "Abrir en…": la web arma un enlace intent:// (lib/externalPlayers.ts). El WebView no los sabe
     * abrir, así que se traducen acá. Solo se acepta ver un video http(s); nada de componentes ni
     * selectores elegidos por la página.
     */
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (!"intent".equals(url.getScheme())) return null;
        Intent intent;
        try {
            intent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
        } catch (URISyntaxException e) {
            return true;
        }
        Uri data = intent.getData();
        String scheme = data != null ? data.getScheme() : null;
        if (!"http".equals(scheme) && !"https".equals(scheme)) return true;
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(data, intent.getType() != null ? intent.getType() : "video/*");
        String title = intent.getStringExtra("title");
        if (title != null) view.putExtra("title", title);
        view.addCategory(Intent.CATEGORY_BROWSABLE);
        String pkg = intent.getPackage();
        try {
            if (pkg != null) view.setPackage(pkg);
            getActivity().startActivity(view);
        } catch (ActivityNotFoundException e) {
            // El reproductor elegido no está instalado: se ofrece cualquiera de los que haya.
            view.setPackage(null);
            try {
                getActivity().startActivity(Intent.createChooser(view, "Abrir con"));
            } catch (ActivityNotFoundException e2) {
                Toast.makeText(getContext(), "No hay ningún reproductor de video instalado", Toast.LENGTH_LONG).show();
            }
        }
        return true;
    }
}
