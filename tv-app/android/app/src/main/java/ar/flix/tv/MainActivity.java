package ar.flix.tv;

import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.PluginHandle;

/**
 * La app es la web de siempre (series-pelis.pages.dev) dentro de un WebView: las novedades llegan
 * con cada versión del sitio, sin reinstalar el APK. Lo nativo es solo lo que el navegador no da:
 * el botón Atrás del control, la pantalla prendida, abrir otro reproductor y marcarse como TV.
 */
public class MainActivity extends BridgeActivity {

    static final String SITE = "https://series-pelis.pages.dev";

    // BridgeActivity llama a onNewIntent(getIntent()) dentro de su onCreate: ese no es un enlace nuevo.
    private boolean creating;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SpNativePlugin.class);
        creating = true;
        try {
            super.onCreate(savedInstanceState);
        } finally {
            creating = false;
        }
        // Abierta desde una fila del inicio de la TV ("A continuación"). Si Android recrea
        // la actividad (savedInstanceState), el intent es el viejo y ya se usó.
        if (savedInstanceState == null) DeepLink.offer(getIntent());
        // Gesto de "atrás" en un celular (en la TV lo agarra dispatchKeyEvent antes).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                NativePlayer p = nativePlayer();
                if (p != null) p.onBack();
                else sendBackToWeb();
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (creating || intent == null) return;
        // La app ya estaba abierta (singleTask) y se eligió otra tarjeta del inicio de la TV.
        if (DeepLink.offer(intent)) {
            setIntent(intent);
            SpNativePlugin plugin = spNative();
            if (plugin != null) plugin.notifyOpen();
        }
    }

    @Override
    protected void load() {
        // La configuración va acá y no en capacitor.config.json para poder sumar "AndroidTV" al
        // User-Agent solo en los televisores: la web lo usa para prender el modo TV sola.
        String ua = "FlixApp/" + BuildConfig.VERSION_NAME + (isTv(this) ? " AndroidTV" : "");
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
        // Con el reproductor nativo abierto, las teclas son suyas primero (Atrás incluido).
        NativePlayer p = nativePlayer();
        if (p != null) {
            if (p.handleKey(event)) return true;
            return super.dispatchKeyEvent(event);
        }
        // Atrás del control: lo decide la web (cerrar un menú, salir del reproductor, volver de página).
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && bridge != null) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) sendBackToWeb();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private SpNativePlugin spNative() {
        if (bridge == null) return null;
        PluginHandle h = bridge.getPlugin("SpNative");
        if (h == null || !(h.getInstance() instanceof SpNativePlugin)) return null;
        return (SpNativePlugin) h.getInstance();
    }

    /** El reproductor nativo si está abierto; si no, null. */
    private NativePlayer nativePlayer() {
        SpNativePlugin plugin = spNative();
        NativePlayer p = plugin != null ? plugin.player() : null;
        return p != null && p.isOpen() ? p : null;
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
