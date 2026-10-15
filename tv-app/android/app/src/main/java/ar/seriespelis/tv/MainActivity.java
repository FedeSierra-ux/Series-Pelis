package ar.seriespelis.tv;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

/**
 * La app es la web de siempre (series-pelis.pages.dev) dentro de un WebView: las novedades llegan
 * con cada versión del sitio, sin reinstalar el APK. Lo nativo es solo lo que el navegador no da:
 * el botón Atrás del control, la pantalla prendida, abrir otro reproductor y marcarse como TV.
 */
public class MainActivity extends BridgeActivity {

    static final String SITE = "https://series-pelis.pages.dev";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SpNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Gesto de "atrás" en un celular (en la TV lo agarra dispatchKeyEvent antes).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                sendBackToWeb();
            }
        });
    }

    @Override
    protected void load() {
        // La configuración va acá y no en capacitor.config.json para poder sumar "AndroidTV" al
        // User-Agent solo en los televisores: la web lo usa para prender el modo TV sola.
        String ua = "SeriesPelisApp/" + BuildConfig.VERSION_NAME + (isTv(this) ? " AndroidTV" : "");
        config = new CapConfig.Builder(this)
            .setServerUrl(SITE)
            .setErrorPath("error.html")
            .setAppendedUserAgentString(ua)
            .setBackgroundColor("#0b0b10")
            .setResolveServiceWorkerRequests(false)
            .setInitialFocus(true)
            .create();
        super.load();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Atrás del control: lo decide la web (cerrar un menú, salir del reproductor, volver de página).
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && bridge != null) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) sendBackToWeb();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void sendBackToWeb() {
        WebView web = bridge != null ? bridge.getWebView() : null;
        if (web == null) {
            moveTaskToBack(true);
            return;
        }
        // __spNativeBack devuelve true si la web lo resolvió; si no (página de error, la web
        // todavía no cargó) la app se va al fondo, como el resto de las apps de la TV.
        web.evaluateJavascript(
            "(function(){try{return !!(window.__spNativeBack&&window.__spNativeBack())}catch(e){return false}})()",
            (handled) -> {
                if (!"true".equals(handled)) moveTaskToBack(true);
            }
        );
    }

    @Override
    public void onPause() {
        super.onPause();
        // La cookie de sesión vive en memoria hasta que se guarda: sin esto, cerrar la app justo
        // después de entrar podía pedir el código de nuevo.
        CookieManager.getInstance().flush();
    }

    static boolean isTv(Context ctx) {
        UiModeManager ui = (UiModeManager) ctx.getSystemService(Context.UI_MODE_SERVICE);
        if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        PackageManager pm = ctx.getPackageManager();
        return pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK) || pm.hasSystemFeature("amazon.hardware.fire_tv");
    }
}
