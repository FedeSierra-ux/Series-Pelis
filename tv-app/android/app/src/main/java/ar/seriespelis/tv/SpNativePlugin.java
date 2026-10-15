package ar.seriespelis.tv;

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

/** Lo que la web le pide a la app (en JS: window.Capacitor.Plugins.SpNative). */
@CapacitorPlugin(name = "SpNative")
public class SpNativePlugin extends Plugin {

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject res = new JSObject();
        res.put("tv", MainActivity.isTv(getContext()));
        res.put("version", BuildConfig.VERSION_NAME);
        call.resolve(res);
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
