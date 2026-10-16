package ar.flix.tv;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ListView;
import android.widget.TextView;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AlertDialog;
import androidx.core.view.TintableBackgroundView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.CaptionStyleCompat;
import androidx.media3.ui.DefaultTimeBar;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.SubtitleView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reproductor nativo (v0.20): ExoPlayer en una capa encima del WebView, en la misma Activity, así la
 * web sigue corriendo y contesta los eventos. La web decide todo (qué subtítulo, cuándo saltar, cuál
 * es el siguiente, dónde guardar el progreso); acá solo se reproduce y se muestran los controles.
 * El contrato está en src/lib/nativePlayer.ts. Todo corre en el hilo de la interfaz.
 */
@OptIn(markerClass = UnstableApi.class)
final class NativePlayer {

    /** Manda un evento `player` a la web. */
    interface Events {
        void emit(JSObject event);
    }

    private interface Pick {
        void on(int which);
    }

    private static final long TICK_MS = 100;
    private static final long PROGRESS_MS = 5000;
    private static final long COUNTDOWN_MS = 10000;
    private static final long TOAST_MS = 3000;
    private static final long RETRY_RESET_MS = 30000;
    private static final long NEXT_DEBOUNCE_MS = 1500;
    private static final Locale ES = Locale.forLanguageTag("es-AR");

    private final Activity activity;
    private final WebView web;
    private final Events events;
    private final Handler ui = new Handler(Looper.getMainLooper());

    // Vistas (null con el reproductor cerrado).
    private FrameLayout root;
    private PlayerView playerView;
    private TextView titleView;
    private TextView subtitleView;
    private Button nextEpisodeBtn;
    private SubtitleTextView extSub;
    private Button skipBtn;
    private View nextCard;
    private TextView nextLabelView;
    private TextView nextStatus;
    private Button nextNow;
    private TextView toast;
    private ExoPlayer player;
    private AlertDialog dialog;
    private boolean controllerShown;

    // Lo que manda la web.
    private long introStart = -1, introEnd = -1, recapStart = -1, recapEnd = -1;
    private String skipMode = "off";
    private boolean recapAuto = true;
    private long nextAtMs = -1;
    private String nextLabel = "";
    private boolean autoplayNext;
    private boolean loadingNext;
    private final List<String[]> extSubs = new ArrayList<>(); // {id, label}
    private String selectedSub = "";
    private boolean embApplied;
    private final Map<String, List<VttParser.Cue>> vtt = new HashMap<>();
    private Style style = new Style();

    // Estado del video actual (se reinicia con cada playerOpen).
    private boolean readyEmitted, started, endedHandled, retryUsed;
    private long retryAt;
    private final Set<String> autoSkipped = new HashSet<>();
    private String skipKind;
    private long skipEndMs;
    private boolean nextDismissed;
    private long countdownLeft = -1;
    private long lastNextRequest;
    private long lastTick, lastProgress;
    private String shownCues = "";

    NativePlayer(Activity activity, WebView web, Events events) {
        this.activity = activity;
        this.web = web;
        this.events = events;
    }

    boolean isOpen() {
        return root != null;
    }

    // ---------- contrato con la web ----------

    void open(JSONObject o) {
        if (!isOpen()) build();
        resetItem();

        titleView.setText(o.optString("title", ""));
        String sub = o.isNull("subtitle") ? "" : o.optString("subtitle", "");
        subtitleView.setText(sub);
        subtitleView.setVisibility(sub.isEmpty() ? View.GONE : View.VISIBLE);
        style = Style.from(o.optJSONObject("subtitleStyle"));
        applyStyle();

        // Sin subtítulos hasta que la web elija (selectSub); idiomas de audio en el orden pedido.
        TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon()
            .clearOverrides()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .setPreferredAudioLanguages(strings(o.optJSONArray("audioLangs")));
        player.setTrackSelectionParameters(b.build());

        double rate = o.optDouble("rate", 1);
        player.setPlaybackSpeed(rate > 0 && rate <= 4 ? (float) rate : 1f);

        String url = o.optString("url", "");
        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        if (url.toLowerCase(Locale.ROOT).contains(".m3u8")) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        double startAt = o.optDouble("startAt", 0);
        long startMs = startAt > 0 ? (long) (startAt * 1000) : 0;
        player.setMediaItem(item.build(), startMs);
        boolean paused = o.optBoolean("paused", false);
        player.setPlayWhenReady(!paused);
        player.prepare();

        if (paused) {
            playerView.showController();
            focusController();
        } else {
            playerView.hideController();
            playerView.requestFocus();
        }
    }

    /** Lo que no viene, no cambia. */
    void update(JSONObject o) {
        if (!isOpen()) return;
        if (o.has("intro")) {
            long[] s = segment(o.optJSONObject("intro"));
            introStart = s[0];
            introEnd = s[1];
        }
        if (o.has("recap")) {
            long[] s = segment(o.optJSONObject("recap"));
            recapStart = s[0];
            recapEnd = s[1];
        }
        if (o.has("skipMode") && !o.isNull("skipMode")) skipMode = o.optString("skipMode", "off");
        if (o.has("recapAuto")) recapAuto = o.optBoolean("recapAuto", true);
        if (o.has("nextAt")) {
            double at = o.optDouble("nextAt", Double.NaN);
            nextAtMs = o.isNull("nextAt") || Double.isNaN(at) ? -1 : Math.max(0, (long) (at * 1000));
            nextEpisodeBtn.setVisibility(nextAtMs >= 0 ? View.VISIBLE : View.GONE);
        }
        if (o.has("nextLabel")) nextLabel = o.isNull("nextLabel") ? "" : o.optString("nextLabel", "");
        if (o.has("autoplayNext")) {
            autoplayNext = o.optBoolean("autoplayNext", false);
            if (!autoplayNext) countdownLeft = -1;
            else if (countdownLeft < 0 && isVisible(nextCard)) countdownLeft = COUNTDOWN_MS;
        }
        if (o.has("loadingNext")) loadingNext = o.optBoolean("loadingNext", false);
        if (o.has("subtitles")) {
            extSubs.clear();
            JSONArray arr = o.optJSONArray("subtitles");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject s = arr.optJSONObject(i);
                    if (s == null) continue;
                    String id = s.optString("id", "");
                    if (id.isEmpty()) continue;
                    extSubs.add(new String[] { id, s.optString("label", id) });
                }
            }
        }
        if (o.has("selectSub")) applySub(o.isNull("selectSub") ? "" : o.optString("selectSub", ""));
        if (o.has("toast") && !o.isNull("toast")) {
            String t = o.optString("toast", "");
            if (!t.isEmpty()) showToast(t);
        }
        refreshNextCard();
    }

    /** El texto de un subtítulo externo (ya leído en otro hilo). Puede llegar antes o después de elegirlo. */
    void subtitleData(String id, List<VttParser.Cue> cues) {
        if (!isOpen() || id == null) return;
        vtt.put(id, cues);
        if (id.equals(selectedSub)) {
            shownCues = null;
            updateExtSub(player.getCurrentPosition());
        }
    }

    /** `playerClose()` de la web: se cierra sin avisar `closed`. */
    void close() {
        teardown();
    }

    // ---------- ciclo de vida de la Activity ----------

    /** La app pasa al fondo (Home, otra app): se pausa; seguir es cosa del usuario. */
    void onHostPause() {
        if (!isOpen()) return;
        if (player.getPlayWhenReady()) player.pause(); // el listener manda el progreso
    }

    void onHostDestroy() {
        teardown();
    }

    // ---------- teclas ----------

    /** Se llama desde MainActivity antes que nadie mientras el reproductor está abierto. */
    boolean handleKey(KeyEvent e) {
        if (!isOpen()) return false;
        int code = e.getKeyCode();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        if (code == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP && !e.isCanceled()) onBack();
            return true;
        }
        if (isMediaKey(code)) {
            playerView.dispatchMediaKeyEvent(e);
            if (down) playerView.showController();
            return true;
        }
        boolean ok = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
            || code == KeyEvent.KEYCODE_NUMPAD_ENTER;
        boolean arrow = code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN
            || code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT;
        if ((ok || arrow) && !playerView.isControllerFullyVisible()) {
            // OK sobre "Saltar" o "Ver ahora" los aprieta; cualquier otra flecha muestra los controles.
            if (ok && onOwnButton()) return false;
            if (down && e.getRepeatCount() == 0) {
                playerView.showController();
                focusController();
            }
            return true;
        }
        // Con los controles a la vista, cada tecla reinicia el tiempo para que no se escondan.
        if (down && controllerShown) playerView.showController();
        return false;
    }

    /** Atrás: menú → tarjeta del siguiente → controles → salir. */
    void onBack() {
        if (!isOpen()) return;
        if (dialog != null) {
            dialog.dismiss();
            return;
        }
        if (isVisible(nextCard)) {
            nextDismissed = true;
            hideNextCard();
            return;
        }
        if (controllerShown) {
            playerView.hideController();
            return;
        }
        JSObject ev = event("closed");
        ev.put("position", seconds(player.getCurrentPosition()));
        ev.put("duration", seconds(duration()));
        events.emit(ev);
        teardown();
    }

    // ---------- armado ----------

    private void build() {
        ViewGroup content = activity.findViewById(android.R.id.content);
        root = (FrameLayout) LayoutInflater.from(activity).inflate(R.layout.sp_player, content, false);
        playerView = root.findViewById(R.id.sp_player_view);
        titleView = root.findViewById(R.id.sp_title);
        subtitleView = root.findViewById(R.id.sp_subtitle);
        nextEpisodeBtn = root.findViewById(R.id.sp_btn_next);
        extSub = root.findViewById(R.id.sp_ext_sub);
        skipBtn = root.findViewById(R.id.sp_skip);
        nextCard = root.findViewById(R.id.sp_next_card);
        nextLabelView = root.findViewById(R.id.sp_next_label);
        nextStatus = root.findViewById(R.id.sp_next_status);
        nextNow = root.findViewById(R.id.sp_next_now);
        toast = root.findViewById(R.id.sp_toast);

        root.findViewById(R.id.sp_btn_audio).setOnClickListener((v) -> showAudioMenu());
        root.findViewById(R.id.sp_btn_subs).setOnClickListener((v) -> showSubsMenu());
        nextEpisodeBtn.setOnClickListener((v) -> requestNext(false));
        nextNow.setOnClickListener((v) -> requestNext(false));
        skipBtn.setOnClickListener((v) -> {
            if (skipKind != null && player != null) player.seekTo(skipEndMs);
            hideSkip();
        });

        // Foco bien visible en los botones de Media3 (play, atrasar, adelantar).
        int[] icons = { androidx.media3.ui.R.id.exo_play_pause, androidx.media3.ui.R.id.exo_rew_with_amount,
            androidx.media3.ui.R.id.exo_ffwd_with_amount };
        for (int id : icons) {
            View v = playerView.findViewById(id);
            if (v == null) continue;
            v.setBackgroundResource(R.drawable.sp_icon_btn_bg);
            if (v instanceof TintableBackgroundView) ((TintableBackgroundView) v).setSupportBackgroundTintList(null);
        }
        View bar = playerView.findViewById(androidx.media3.ui.R.id.exo_progress);
        if (bar instanceof DefaultTimeBar) ((DefaultTimeBar) bar).setKeyTimeIncrement(10_000);

        String ua = null;
        try {
            ua = web != null ? web.getSettings().getUserAgentString() : null;
        } catch (RuntimeException ignored) {
            // Sin el User-Agent del WebView queda el de Media3.
        }
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000);
        if (ua != null && !ua.isEmpty()) http.setUserAgent(ua);
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(activity).setEnableDecoderFallback(true);
        AudioAttributes audio = new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build();
        player = new ExoPlayer.Builder(activity, renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(activity, http)))
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .setAudioAttributes(audio, true)
            .setHandleAudioBecomingNoisy(true)
            .build();
        player.addListener(listener);
        playerView.setPlayer(player);
        playerView.setShowSubtitleButton(false);
        playerView.setShowNextButton(false);
        playerView.setShowPreviousButton(false);
        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) this::onControllerVisibility);

        root.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            if (r - l != or - ol || b - t != ob - ot) applyStyle();
        });
        content.addView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // La web queda atrás: sin foco (las flechas no se escapan a ella) y la pantalla siempre prendida.
        if (web != null) {
            web.setFocusable(false);
            web.setFocusableInTouchMode(false);
        }
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());

        lastTick = SystemClock.elapsedRealtime();
        ui.post(tick);
    }

    private void resetItem() {
        if (dialog != null) dialog.dismiss();
        introStart = introEnd = recapStart = recapEnd = -1;
        nextAtMs = -1;
        nextLabel = "";
        loadingNext = false;
        extSubs.clear();
        vtt.clear();
        selectedSub = "";
        embApplied = false;
        readyEmitted = started = endedHandled = retryUsed = false;
        autoSkipped.clear();
        nextDismissed = false;
        countdownLeft = -1;
        lastNextRequest = 0;
        lastProgress = SystemClock.elapsedRealtime();
        shownCues = "";
        nextEpisodeBtn.setVisibility(View.GONE);
        extSub.setVisibility(View.GONE);
        hideSkip();
        hideNextCard();
    }

    private void teardown() {
        if (!isOpen()) return;
        if (dialog != null) dialog.dismiss();
        dialog = null;
        ui.removeCallbacksAndMessages(null);
        player.removeListener(listener);
        playerView.setPlayer(null);
        player.release();
        player = null;
        ViewGroup parent = (ViewGroup) root.getParent();
        if (parent != null) parent.removeView(root);
        root = null;
        controllerShown = false;
        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView())
            .show(WindowInsetsCompat.Type.systemBars());
        if (web != null) {
            web.setFocusable(true);
            web.setFocusableInTouchMode(true);
            web.requestFocus();
        }
    }

    // ---------- eventos de ExoPlayer ----------

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int state) {
            if (state == Player.STATE_READY && !readyEmitted) {
                readyEmitted = true;
                JSObject ev = event("ready");
                ev.put("duration", seconds(duration()));
                events.emit(ev);
            }
            if (state == Player.STATE_ENDED) onEnded();
            else endedHandled = false;
        }

        @Override
        public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
            if (!playWhenReady) emitProgress();
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            if (isPlaying) started = true;
        }

        @Override
        public void onRenderedFirstFrame() {
            started = true;
        }

        @Override
        public void onTracksChanged(Tracks tracks) {
            emitTracks(tracks);
            if (selectedSub.startsWith("emb:") && !embApplied) applySub(selectedSub);
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            onError(error);
        }
    };

    private void onEnded() {
        if (endedHandled) return;
        endedHandled = true;
        emitProgress();
        if (nextAtMs >= 0) requestNext(true);
        else events.emit(event("ended"));
    }

    private void onError(PlaybackException error) {
        if (player == null) return;
        // A mitad de la peli se reintenta una vez en el mismo lugar (un corte de red, por ejemplo).
        if (started && !retryUsed) {
            retryUsed = true;
            retryAt = SystemClock.elapsedRealtime();
            player.prepare();
            return;
        }
        JSObject ev = event("error");
        ev.put("message", errorText(error));
        ev.put("position", seconds(player.getCurrentPosition()));
        events.emit(ev);
        teardown();
    }

    private static String errorText(PlaybackException e) {
        int code = e.errorCode;
        if (code >= 2000 && code < 3000) {
            Throwable c = e.getCause();
            while (c != null && !(c instanceof HttpDataSource.InvalidResponseCodeException)) c = c.getCause();
            if (c != null) {
                return "No se pudo conectar con la fuente (HTTP " + ((HttpDataSource.InvalidResponseCodeException) c).responseCode + ")";
            }
            return "No se pudo conectar con la fuente";
        }
        if (code >= 3000 && code < 6000) return "Este formato no se puede reproducir en este aparato";
        if (code >= 6000 && code < 7000) return "Este video tiene protección y no se puede reproducir acá";
        if (code == PlaybackException.ERROR_CODE_TIMEOUT) return "La fuente tardó demasiado en responder";
        return "No se pudo reproducir el video";
    }

    // ---------- reloj (cada 100 ms) ----------

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (player == null) return;
            long now = SystemClock.elapsedRealtime();
            long dt = now - lastTick;
            lastTick = now;
            long pos = player.getCurrentPosition();
            int state = player.getPlaybackState();
            boolean active = state == Player.STATE_READY || state == Player.STATE_BUFFERING;
            updateExtSub(pos);
            updateSkip(pos, active);
            updateNext(pos, dt, state != Player.STATE_IDLE);
            if (player.isPlaying() && now - lastProgress >= PROGRESS_MS) emitProgress();
            if (retryUsed && player.isPlaying() && now - retryAt > RETRY_RESET_MS) retryUsed = false;
            ui.postDelayed(this, TICK_MS);
        }
    };

    private void emitProgress() {
        if (player == null) return;
        lastProgress = SystemClock.elapsedRealtime();
        JSObject ev = event("progress");
        ev.put("position", seconds(player.getCurrentPosition()));
        ev.put("duration", seconds(duration()));
        ev.put("playing", player.isPlaying());
        events.emit(ev);
    }

    // ---------- saltar intro / resumen ----------

    private void updateSkip(long pos, boolean active) {
        String kind = null;
        long start = -1, end = -1;
        if (active && !"off".equals(skipMode)) {
            // El resumen tiene prioridad sobre la intro.
            if (recapEnd > recapStart && pos >= recapStart && pos < recapEnd) {
                kind = "recap";
                start = recapStart;
                end = recapEnd;
            } else if (introEnd > introStart && pos >= introStart && pos < introEnd) {
                kind = "intro";
                start = introStart;
                end = introEnd;
            }
        }
        if (kind == null) {
            hideSkip();
            return;
        }
        boolean intro = "intro".equals(kind);
        if ("auto".equals(skipMode) && (intro || recapAuto) && autoSkipped.add(kind + ":" + start + ":" + end)) {
            player.seekTo(end);
            showToast(intro ? "Se saltó la intro" : "Se saltó el resumen");
            hideSkip();
            return;
        }
        skipEndMs = end;
        if (kind.equals(skipKind)) return;
        skipKind = kind;
        skipBtn.setText(intro ? "Saltar intro" : "Saltar resumen");
        skipBtn.setVisibility(View.VISIBLE);
        if (!controllerShown && dialog == null) skipBtn.requestFocus();
    }

    private void hideSkip() {
        skipKind = null;
        if (skipBtn == null || skipBtn.getVisibility() == View.GONE) return;
        boolean hadFocus = skipBtn.hasFocus();
        skipBtn.setVisibility(View.GONE);
        if (hadFocus) focusDefault();
    }

    // ---------- tarjeta del siguiente episodio ----------

    private void updateNext(long pos, long dt, boolean loaded) {
        if (nextAtMs < 0 || pos < nextAtMs) nextDismissed = false;
        boolean show = loaded && nextAtMs >= 0 && pos >= nextAtMs && !nextDismissed;
        if (!show) {
            hideNextCard();
            return;
        }
        if (!isVisible(nextCard)) {
            nextCard.setVisibility(View.VISIBLE);
            countdownLeft = autoplayNext ? COUNTDOWN_MS : -1;
            if (!controllerShown && dialog == null) nextNow.requestFocus();
        }
        // La cuenta se frena con el video en pausa (o cargando).
        if (countdownLeft > 0 && player.isPlaying() && !loadingNext && dialog == null) {
            countdownLeft -= dt;
            if (countdownLeft <= 0) {
                countdownLeft = 0;
                requestNext(true);
            }
        }
        refreshNextCard();
    }

    private void refreshNextCard() {
        if (nextCard == null || !isVisible(nextCard)) return;
        nextLabelView.setText(nextLabel.isEmpty() ? "Siguiente episodio" : "Siguiente: " + nextLabel);
        String status = "";
        if (loadingNext) status = "Cargando…";
        else if (countdownLeft > 0) status = "Empieza en " + (int) Math.ceil(countdownLeft / 1000.0) + " s";
        nextStatus.setText(status);
        nextStatus.setVisibility(status.isEmpty() ? View.GONE : View.VISIBLE);
        nextNow.setAlpha(loadingNext ? 0.6f : 1f);
    }

    private void hideNextCard() {
        if (nextCard == null || nextCard.getVisibility() == View.GONE) return;
        boolean hadFocus = nextCard.hasFocus();
        nextCard.setVisibility(View.GONE);
        countdownLeft = -1;
        if (hadFocus) focusDefault();
    }

    private void requestNext(boolean auto) {
        long now = SystemClock.elapsedRealtime();
        if (loadingNext || nextAtMs < 0 || now - lastNextRequest < NEXT_DEBOUNCE_MS) return;
        lastNextRequest = now;
        JSObject ev = event("next");
        ev.put("auto", auto);
        events.emit(ev);
    }

    // ---------- pistas ----------

    private void emitTracks(Tracks tracks) {
        JSArray audio = new JSArray();
        JSArray text = new JSArray();
        List<Tracks.Group> groups = tracks.getGroups();
        int na = 0, nt = 0;
        for (int g = 0; g < groups.size(); g++) {
            Tracks.Group group = groups.get(g);
            for (int t = 0; t < group.length; t++) {
                if (!group.isTrackSupported(t)) continue;
                Format f = group.getTrackFormat(t);
                if (group.getType() == C.TRACK_TYPE_AUDIO) {
                    JSObject a = new JSObject();
                    a.put("id", "aud:" + g + ":" + t);
                    a.put("label", audioLabel(f, ++na));
                    String lang = lang(f);
                    if (lang != null) a.put("lang", lang);
                    a.put("selected", group.isTrackSelected(t));
                    audio.put(a);
                } else if (group.getType() == C.TRACK_TYPE_TEXT) {
                    JSObject s = new JSObject();
                    s.put("id", "emb:" + g + ":" + t);
                    s.put("label", textLabel(f, ++nt));
                    String lang = lang(f);
                    if (lang != null) s.put("lang", lang);
                    if ((f.selectionFlags & C.SELECTION_FLAG_FORCED) != 0) s.put("forced", true);
                    text.put(s);
                }
            }
        }
        JSObject ev = event("tracks");
        ev.put("audio", audio);
        ev.put("text", text);
        events.emit(ev);
    }

    /** '' apaga; `emb:g:t` es una pista del video; otro id es externo (se dibuja acá cuando llega el VTT). */
    private void applySub(String id) {
        selectedSub = id == null ? "" : id;
        embApplied = false;
        TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon().clearOverridesOfType(C.TRACK_TYPE_TEXT);
        if (selectedSub.startsWith("emb:")) {
            TrackSelectionOverride ov = embeddedOverride(selectedSub, player.getCurrentTracks());
            if (ov != null) {
                b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false).setOverrideForType(ov);
                embApplied = true;
            } else {
                // Todavía no están las pistas: se aplica en onTracksChanged.
                b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
            }
        } else {
            b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
        }
        player.setTrackSelectionParameters(b.build());
        shownCues = null;
        updateExtSub(player.getCurrentPosition());
    }

    private static TrackSelectionOverride embeddedOverride(String id, Tracks tracks) {
        String[] parts = id.split(":");
        if (parts.length != 3) return null;
        try {
            int g = Integer.parseInt(parts[1]);
            int t = Integer.parseInt(parts[2]);
            List<Tracks.Group> groups = tracks.getGroups();
            if (g < 0 || g >= groups.size()) return null;
            Tracks.Group group = groups.get(g);
            if (group.getType() != C.TRACK_TYPE_TEXT || t < 0 || t >= group.length) return null;
            return new TrackSelectionOverride(group.getMediaTrackGroup(), t);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ---------- menús ----------

    private void showAudioMenu() {
        if (player == null) return;
        List<Tracks.Group> groups = player.getCurrentTracks().getGroups();
        List<int[]> refs = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        int checked = -1;
        for (int g = 0; g < groups.size(); g++) {
            Tracks.Group group = groups.get(g);
            if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
            for (int t = 0; t < group.length; t++) {
                if (!group.isTrackSupported(t)) continue;
                if (group.isTrackSelected(t)) checked = refs.size();
                refs.add(new int[] { g, t });
                labels.add(audioLabel(group.getTrackFormat(t), refs.size()));
            }
        }
        if (refs.isEmpty()) {
            showToast("Este video no tiene pistas de audio para elegir");
            return;
        }
        showChoice("Audio", labels, checked, (which) -> {
            if (player == null) return;
            int[] ref = refs.get(which);
            List<Tracks.Group> now = player.getCurrentTracks().getGroups();
            if (ref[0] >= now.size()) return;
            Tracks.Group group = now.get(ref[0]);
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setOverrideForType(new TrackSelectionOverride(group.getMediaTrackGroup(), ref[1]))
                .build());
            JSObject ev = event("audioPicked");
            String lang = lang(group.getTrackFormat(ref[1]));
            if (lang != null) ev.put("lang", lang);
            events.emit(ev);
        });
    }

    private void showSubsMenu() {
        if (player == null) return;
        List<String> ids = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        ids.add("");
        labels.add("Desactivados");
        List<Tracks.Group> groups = player.getCurrentTracks().getGroups();
        int n = 0;
        for (int g = 0; g < groups.size(); g++) {
            Tracks.Group group = groups.get(g);
            if (group.getType() != C.TRACK_TYPE_TEXT) continue;
            for (int t = 0; t < group.length; t++) {
                if (!group.isTrackSupported(t)) continue;
                ids.add("emb:" + g + ":" + t);
                labels.add(textLabel(group.getTrackFormat(t), ++n));
            }
        }
        for (String[] s : extSubs) {
            ids.add(s[0]);
            labels.add(s[1]);
        }
        showChoice("Subtítulos", labels, ids.indexOf(selectedSub), (which) -> {
            if (player == null) return;
            String id = ids.get(which);
            applySub(id);
            JSObject ev = event("subPicked");
            ev.put("id", id);
            events.emit(ev);
        });
    }

    private void showChoice(String title, List<String> labels, int checked, Pick pick) {
        if (dialog != null) dialog.dismiss();
        // Mientras el menú está abierto los controles no se esconden (el foco vuelve a su botón).
        playerView.setControllerShowTimeoutMs(0);
        playerView.showController();
        AlertDialog d = new AlertDialog.Builder(activity, R.style.SpPlayerDialog)
            .setTitle(title)
            .setSingleChoiceItems(labels.toArray(new CharSequence[0]), checked, (di, which) -> {
                di.dismiss();
                pick.on(which);
            })
            .create();
        d.setOnDismissListener((di) -> {
            if (dialog == di) dialog = null;
            if (!isOpen()) return;
            playerView.setControllerShowTimeoutMs(5000);
            playerView.showController();
        });
        dialog = d;
        d.show();
        ListView list = d.getListView();
        if (list != null) list.setSelector(R.drawable.sp_list_selector);
    }

    // ---------- subtítulos externos ----------

    private void updateExtSub(long pos) {
        if (extSub == null) return;
        List<VttParser.Cue> cues = isExternal(selectedSub) ? vtt.get(selectedSub) : null;
        if (cues == null) {
            if (extSub.getVisibility() != View.GONE) extSub.setVisibility(View.GONE);
            shownCues = "";
            return;
        }
        StringBuilder key = new StringBuilder();
        android.text.SpannableStringBuilder text = new android.text.SpannableStringBuilder();
        for (int i = 0; i < cues.size(); i++) {
            VttParser.Cue c = cues.get(i);
            if (c.startMs > pos) break;
            if (pos >= c.endMs) continue;
            if (text.length() > 0) text.append('\n');
            text.append(c.text);
            key.append(i).append(',');
        }
        String k = key.toString();
        if (k.equals(shownCues)) return;
        shownCues = k;
        if (text.length() == 0) {
            extSub.setVisibility(View.GONE);
        } else {
            extSub.setText(text);
            extSub.setVisibility(View.VISIBLE);
        }
    }

    private static boolean isExternal(String id) {
        return id != null && !id.isEmpty() && !id.startsWith("emb:");
    }

    /** El estilo de Ajustes → Subtítulos, para los externos (texto propio) y los del video (SubtitleView). */
    private void applyStyle() {
        if (root == null) return;
        int h = root.getHeight() > 0 ? root.getHeight() : activity.getResources().getDisplayMetrics().heightPixels;
        int w = root.getWidth() > 0 ? root.getWidth() : activity.getResources().getDisplayMetrics().widthPixels;
        float size = h * style.sizeFraction();
        float raise = 0.08f + style.position / 100f;

        extSub.setTextSize(TypedValue.COMPLEX_UNIT_PX, size);
        extSub.setTextColor(style.textColor());
        extSub.setMaxWidth((int) (w * 0.86f));
        int padH = Math.round(size * 0.35f);
        int padV = Math.round(size * 0.08f);
        extSub.setPadding(padH, padV, padH, padV);
        int bg = style.backgroundColor();
        if (bg != 0) {
            GradientDrawable box = new GradientDrawable();
            box.setColor(bg);
            box.setCornerRadius(size * 0.15f);
            extSub.setBackground(box);
            extSub.setShadowLayer(0, 0, 0, 0);
        } else {
            extSub.setBackground(null);
            extSub.setShadowLayer(Math.max(2f, size * 0.12f), 0, size * 0.04f, Color.BLACK);
        }
        extSub.setOutlineWidth(style.outline ? Math.max(2f, size * 0.12f) : 0);
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) extSub.getLayoutParams();
        lp.bottomMargin = Math.round(h * raise);
        extSub.setLayoutParams(lp);

        SubtitleView sv = playerView.getSubtitleView();
        if (sv != null) {
            int edge = style.outline ? CaptionStyleCompat.EDGE_TYPE_OUTLINE
                : bg == 0 ? CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW : CaptionStyleCompat.EDGE_TYPE_NONE;
            sv.setStyle(new CaptionStyleCompat(style.textColor(), bg, Color.TRANSPARENT, edge, Color.BLACK, null));
            sv.setApplyEmbeddedFontSizes(false);
            sv.setFractionalTextSize(style.sizeFraction());
            sv.setBottomPaddingFraction(raise);
        }
    }

    // ---------- controles y foco ----------

    private void onControllerVisibility(int visibility) {
        if (root == null) return;
        controllerShown = visibility == View.VISIBLE;
        // Con los controles a la vista, "Saltar", la tarjeta y los subtítulos suben para no taparlos.
        float lift = controllerShown ? -dp(80) : 0;
        skipBtn.setTranslationY(lift);
        nextCard.setTranslationY(lift);
        extSub.setTranslationY(lift);
        View f = root.findFocus();
        if (controllerShown) {
            if (f == null || f == playerView) focusController();
        } else if (f == null || !onOwnButton()) {
            focusDefault();
        }
    }

    private boolean onOwnButton() {
        View f = root != null ? root.findFocus() : null;
        return f != null && (f == skipBtn || f == nextNow);
    }

    private void focusController() {
        View pp = playerView.findViewById(androidx.media3.ui.R.id.exo_play_pause);
        if (pp != null && pp.isShown()) pp.requestFocus();
        else playerView.requestFocus();
    }

    private void focusDefault() {
        if (root == null) return;
        if (isVisible(skipBtn)) skipBtn.requestFocus();
        else if (isVisible(nextCard)) nextNow.requestFocus();
        else if (controllerShown) focusController();
        else playerView.requestFocus();
    }

    // ---------- avisos ----------

    private final Runnable hideToast = () -> {
        if (toast != null) toast.setVisibility(View.GONE);
    };

    private void showToast(String text) {
        if (toast == null) return;
        toast.setText(text);
        toast.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideToast);
        ui.postDelayed(hideToast, TOAST_MS);
    }

    // ---------- utilidades ----------

    private long duration() {
        long d = player != null ? player.getDuration() : C.TIME_UNSET;
        return d == C.TIME_UNSET || d < 0 ? 0 : d;
    }

    private static double seconds(long ms) {
        return Math.max(0, ms) / 1000.0;
    }

    private static JSObject event(String type) {
        JSObject ev = new JSObject();
        ev.put("type", type);
        return ev;
    }

    private static boolean isVisible(View v) {
        return v != null && v.getVisibility() == View.VISIBLE;
    }

    private float dp(float v) {
        return v * activity.getResources().getDisplayMetrics().density;
    }

    private static boolean isMediaKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_STOP:
                return true;
            default:
                return false;
        }
    }

    private static long[] segment(JSONObject s) {
        if (s == null) return new long[] { -1, -1 };
        double start = s.optDouble("start", Double.NaN);
        double end = s.optDouble("end", Double.NaN);
        if (Double.isNaN(start) || Double.isNaN(end) || end <= start) return new long[] { -1, -1 };
        return new long[] { Math.max(0, (long) (start * 1000)), (long) (end * 1000) };
    }

    private static String[] strings(JSONArray arr) {
        List<String> out = new ArrayList<>();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                String s = arr.optString(i, "");
                if (!s.isEmpty()) out.add(s);
            }
        }
        return out.toArray(new String[0]);
    }

    private static String lang(Format f) {
        String l = f.language;
        return l == null || l.isEmpty() || "und".equals(l) ? null : l;
    }

    private static String langName(String lang) {
        if (lang == null) return null;
        String name = Locale.forLanguageTag(lang).getDisplayName(ES);
        if (name == null || name.isEmpty() || name.equalsIgnoreCase(lang)) return lang;
        return name.substring(0, 1).toUpperCase(ES) + name.substring(1);
    }

    private static String audioLabel(Format f, int n) {
        String name = f.label != null && !f.label.isEmpty() ? f.label : langName(lang(f));
        if (name == null) name = "Pista " + n;
        String ch = null;
        if (f.channelCount == 1) ch = "Mono";
        else if (f.channelCount == 2) ch = "Estéreo";
        else if (f.channelCount == 6) ch = "5.1";
        else if (f.channelCount == 8) ch = "7.1";
        else if (f.channelCount > 2) ch = f.channelCount + " canales";
        return ch != null && !name.contains(ch) ? name + " · " + ch : name;
    }

    private static String textLabel(Format f, int n) {
        String name = f.label != null && !f.label.isEmpty() ? f.label : langName(lang(f));
        if (name == null) name = "Subtítulo " + n;
        if ((f.selectionFlags & C.SELECTION_FLAG_FORCED) != 0 && !name.toLowerCase(ES).contains("forz")) name += " (forzados)";
        if (MimeTypes.APPLICATION_CEA608.equals(f.sampleMimeType) || MimeTypes.APPLICATION_CEA708.equals(f.sampleMimeType)) {
            name += " (CC)";
        }
        return name;
    }

    /** NativeSubtitleStyle de la web. */
    private static final class Style {
        String size = "m";
        String color = "white";
        String background = "semi";
        boolean outline;
        int position;

        static Style from(JSONObject o) {
            Style s = new Style();
            if (o == null) return s;
            s.size = o.optString("size", s.size);
            s.color = o.optString("color", s.color);
            s.background = o.optString("background", s.background);
            s.outline = o.optBoolean("outline", false);
            s.position = Math.max(0, Math.min(40, o.optInt("position", 0)));
            return s;
        }

        float sizeFraction() {
            switch (size) {
                case "s":
                    return 0.035f;
                case "l":
                    return 0.055f;
                case "xl":
                    return 0.07f;
                default:
                    return 0.045f;
            }
        }

        int textColor() {
            return "yellow".equals(color) ? 0xFFFFE14D : Color.WHITE;
        }

        int backgroundColor() {
            switch (background) {
                case "none":
                    return 0;
                case "light":
                    return 0x4D000000;
                case "solid":
                    return 0xE6000000;
                default:
                    return 0x8C000000;
            }
        }
    }
}
