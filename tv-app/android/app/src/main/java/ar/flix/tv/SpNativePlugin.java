package ar.flix.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.view.WindowManager;
import android.widget.Toast;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URISyntaxException;
import java.util.List;

/** Lo que la web le pide a la app (en JS: window.Capacitor.Plugins.SpNative). */
@CapacitorPlugin(name = "SpNative")
public class SpNativePlugin extends Plugin {

    // Reproductor nativo (v0.20): se crea con el primer playerOpen y vive en el hilo de la interfaz.
    private NativePlayer player;
    // Actualizaciones desde GitHub Releases (v0.21).
    private AppUpdater updater;

    @Override
    public void load() {
        updater = new AppUpdater(getContext(), (e) -> notifyListeners("update", e));
        updater.cleanupOnStart();
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
            player = new NativePlayer(getActivity(), getBridge().getWebView(), (e) -> notifyListeners("player", e));
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
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (player != null) player.onHostPause();
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        if (player != null) player.onHostPause();
    }

    @Override
    protected void handleOnDestroy() {
        if (player != null) player.onHostDestroy();
        player = null;
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
