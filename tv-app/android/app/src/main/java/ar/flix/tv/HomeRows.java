package ar.flix.tv;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.tvprovider.media.tv.TvContractCompat;
import androidx.tvprovider.media.tv.WatchNextProgram;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Fila del inicio de Android TV (v0.21): "A continuación" (Watch Next del sistema) con lo que se
 * está viendo, el siguiente episodio y los episodios nuevos.
 *
 * La web manda todo el conjunto de una vez (homeSync) y acá se compara con lo que hay publicado:
 * se agrega, se actualiza o se borra para que quede igual. Todo el trabajo con el ContentResolver va
 * en un solo hilo aparte (nunca en el de la interfaz). En los aparatos sin TvProvider (celulares,
 * Fire TV) no se hace nada.
 */
final class HomeRows {

    private static final String TAG = "SpHomeRows";
    private static final String PREFS = "sp_home_rows";
    private static final int MAX_CONTINUE = 20;
    private static final int MAX_REMOVED = 200;
    private static final int MAX_TEXT = 200;
    // Si el usuario sacó una tarjeta, vuelve solo si avanzó al menos esto (o cambió de tipo).
    private static final long MOVED_FORWARD_MS = 30_000;
    private static final long REMOVED_TTL_MS = 60L * 24 * 60 * 60 * 1000;

    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor((r) -> {
        Thread t = new Thread(r, "sp-home-rows");
        t.setPriority(Thread.MIN_PRIORITY);
        return t;
    });

    private static Boolean available;

    private HomeRows() {}

    /**
     * ¿Anda "A continuación" en este aparato? Hace falta Android 8 (API 26, donde aparecen Watch
     * Next), una TV con Leanback y el TvProvider del sistema. En Fire TV no:
     * su inicio no muestra estas filas (ver el informe de la v0.21).
     */
    static synchronized boolean isAvailable(Context ctx) {
        if (available != null) return available;
        boolean ok = false;
        try {
            PackageManager pm = ctx.getPackageManager();
            ok =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !isFireTv(ctx) &&
                pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK) &&
                pm.resolveContentProvider(TvContractCompat.AUTHORITY, 0) != null;
        } catch (Exception e) {
            ok = false;
        }
        available = ok;
        return ok;
    }

    static boolean isFireTv(Context ctx) {
        try {
            return ctx.getPackageManager().hasSystemFeature("amazon.hardware.fire_tv");
        } catch (Exception e) {
            return false;
        }
    }

    /** Encola la sincronización; `done` corre siempre una sola vez, haya andado o no. */
    static void sync(Context ctx, JSONObject data, Runnable done) {
        Context app = ctx.getApplicationContext();
        try {
            WORKER.execute(() -> {
                try {
                    if (isAvailable(app)) syncNow(app, data);
                } catch (Throwable e) {
                    // Un TvProvider raro (o uno que se cae) nunca tiene que romper la app.
                    Log.w(TAG, "No se pudieron actualizar las filas del inicio", e);
                } finally {
                    done.run();
                }
            });
        } catch (RuntimeException e) {
            done.run();
        }
    }

    // ───────────────────────── datos que manda la web ─────────────────────────

    private static final class Item {
        String key;
        String kind;
        String type;
        String title;
        String episodeTitle;
        int season;
        int episode;
        String image;
        String poster;
        long positionMs;
        long durationMs;
        long lastEngagement;
        String path;
    }

    private static void syncNow(Context ctx, JSONObject data) {
        String profile = data.optString("profile", "");
        if (!DeepLink.validProfile(profile)) return;
        List<Item> cont = readItems(data.optJSONArray("continue"), MAX_CONTINUE);
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            syncWatchNext(ctx, prefs, profile, cont);
        } catch (Exception e) {
            Log.w(TAG, "Watch Next", e);
        }
    }

    private static List<Item> readItems(JSONArray arr, int max) {
        List<Item> out = new ArrayList<>();
        if (arr == null) return out;
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < arr.length() && out.size() < max; i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            Item it = new Item();
            it.key = text(o, "key");
            it.type = "series".equals(o.optString("type")) ? "series" : "movie";
            it.title = text(o, "title");
            it.path = o.optString("path", null);
            if (it.key == null || it.title == null || !DeepLink.validPath(it.path) || !seen.add(it.key)) continue;
            it.poster = httpsUrl(o.optString("poster", null));
            String kind = o.optString("kind");
            it.kind = "next".equals(kind) || "new".equals(kind) ? kind : "continue";
            it.episodeTitle = text(o, "episodeTitle");
            it.season = Math.max(0, o.optInt("season", 0));
            it.episode = Math.max(0, o.optInt("episode", 0));
            it.image = httpsUrl(o.optString("image", null));
            it.positionMs = seconds(o.optDouble("position", 0));
            it.durationMs = seconds(o.optDouble("duration", 0));
            it.lastEngagement = Math.max(0, o.optLong("lastEngagement", 0));
            if (!"continue".equals(it.kind)) it.positionMs = 0;
            out.add(it);
        }
        return out;
    }

    private static String text(JSONObject o, String name) {
        if (!o.has(name) || o.isNull(name)) return null;
        String s = o.optString(name, "").trim();
        if (s.isEmpty()) return null;
        return s.length() > MAX_TEXT ? s.substring(0, MAX_TEXT) : s;
    }

    /** Solo imágenes https (el launcher las baja por su cuenta). */
    private static String httpsUrl(String s) {
        if (s == null || s.length() > 2000) return null;
        try {
            Uri u = Uri.parse(s);
            return "https".equals(u.getScheme()) && u.getHost() != null && !u.getHost().isEmpty() ? s : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static long seconds(double s) {
        if (Double.isNaN(s) || s <= 0) return 0;
        // Tope de 24 h: las columnas son int en milisegundos.
        return (long) (Math.min(s, 86_400) * 1000);
    }

    private static String providerId(String profile, String key) {
        return profile + "|" + key;
    }

    // ───────────────────────── A continuación (Watch Next) ─────────────────────────

    private static final class Existing {
        long id;
        boolean browsable;
        int watchNextType;
        long positionMs;
    }

    private static void syncWatchNext(Context ctx, SharedPreferences prefs, String profile, List<Item> items)
        throws JSONException {
        ContentResolver cr = ctx.getContentResolver();
        // Lo que hay publicado ahora (el TvProvider solo devuelve las filas de esta app).
        Map<String, Existing> existing = new HashMap<>();
        List<Long> orphans = new ArrayList<>();
        try (Cursor c = cr.query(TvContractCompat.WatchNextPrograms.CONTENT_URI, WatchNextProgram.PROJECTION, null, null, null)) {
            if (c != null) {
                while (c.moveToNext()) {
                    WatchNextProgram p = WatchNextProgram.fromCursor(c);
                    String ipid = p.getInternalProviderId();
                    // Los WATCHLIST los agrega el usuario desde el sistema: no son nuestros, no se tocan.
                    if (p.getWatchNextType() == TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_WATCHLIST) continue;
                    if (ipid == null || existing.containsKey(ipid)) {
                        orphans.add(p.getId());
                        continue;
                    }
                    Existing e = new Existing();
                    e.id = p.getId();
                    e.browsable = p.isBrowsable();
                    e.watchNextType = p.getWatchNextType();
                    e.positionMs = p.getLastPlaybackPositionMillis();
                    existing.put(ipid, e);
                }
            }
        }
        JSONObject published = json(prefs, "published"); // ipid → huella de lo que se publicó
        JSONObject removed = json(prefs, "removed"); // ipid → {k: tipo, p: posición} al sacarla

        // 1) Lo que el usuario sacó del inicio: el sistema lo deja no visible o lo borra. Se anota
        // para no volver a ponerlo (salvo que avance o cambie de tipo).
        for (Iterator<String> it = published.keys(); it.hasNext(); ) {
            String ipid = it.next();
            Existing e = existing.get(ipid);
            if (e == null || !e.browsable) {
                JSONObject was = published.optJSONObject(ipid);
                if (was != null && !removed.has(ipid)) {
                    JSONObject r = new JSONObject();
                    r.put("k", was.optString("k"));
                    r.put("p", e != null ? e.positionMs : was.optLong("p"));
                    r.put("t", System.currentTimeMillis());
                    removed.put(ipid, r);
                }
            }
        }

        // Una tarjeta oculta que no estaba anotada (por ejemplo, si se borraron los datos de la app).
        for (Map.Entry<String, Existing> en : existing.entrySet()) {
            Existing e = en.getValue();
            if (!e.browsable && !removed.has(en.getKey())) {
                JSONObject r = new JSONObject();
                r.put("k", kindOf(e.watchNextType));
                r.put("p", e.positionMs);
                r.put("t", System.currentTimeMillis());
                removed.put(en.getKey(), r);
            }
        }

        Map<String, Item> wanted = new LinkedHashMap<>();
        for (Item it : items) wanted.put(providerId(profile, it.key), it);

        // 2) Borrar lo nuestro que sobra: no está en el conjunto, es de otro perfil, quedó no
        // visible o es un duplicado viejo.
        for (long id : orphans) delete(cr, id);
        for (Map.Entry<String, Existing> en : existing.entrySet()) {
            Existing e = en.getValue();
            if (!wanted.containsKey(en.getKey()) || !e.browsable) {
                delete(cr, e.id);
                published.remove(en.getKey());
            }
        }

        // 3) Agregar o actualizar.
        JSONObject nextPublished = new JSONObject();
        for (Map.Entry<String, Item> en : wanted.entrySet()) {
            String ipid = en.getKey();
            Item it = en.getValue();
            JSONObject r = removed.optJSONObject(ipid);
            if (r != null) {
                boolean changedKind = !it.kind.equals(r.optString("k"));
                boolean movedOn = it.positionMs > r.optLong("p") + MOVED_FORWARD_MS;
                if (!changedKind && !movedOn) continue;
                removed.remove(ipid);
            }
            String print = fingerprint(it);
            Existing e = existing.get(ipid);
            boolean live = e != null && e.browsable;
            JSONObject was = published.optJSONObject(ipid);
            if (live && was != null && print.equals(was.optString("h"))) {
                nextPublished.put(ipid, was);
                continue;
            }
            // Cada cambio por separado: si uno falla, el resto sigue y lo anotado queda coherente.
            try {
                WatchNextProgram program = buildWatchNext(ctx, profile, ipid, it);
                if (live) {
                    cr.update(TvContractCompat.buildWatchNextProgramUri(e.id), program.toContentValues(), null, null);
                } else {
                    Uri uri = cr.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, program.toContentValues());
                    if (uri == null) continue;
                }
            } catch (Exception ex) {
                Log.w(TAG, "No se pudo publicar una tarjeta de Watch Next", ex);
                if (live && was != null) nextPublished.put(ipid, was);
                continue;
            }
            JSONObject rec = new JSONObject();
            rec.put("h", print);
            rec.put("k", it.kind);
            rec.put("p", it.positionMs);
            nextPublished.put(ipid, rec);
        }

        // Las marcas de "lo sacó el usuario" duran 60 días (y como mucho 200). No se borran apenas
        // la tarjeta deja de venir: si la web manda un conjunto vacío un momento (por ejemplo, antes
        // de cargar los datos), lo sacado no tiene que volver.
        long now = System.currentTimeMillis();
        List<String> drop = new ArrayList<>();
        for (Iterator<String> it = removed.keys(); it.hasNext(); ) {
            String ipid = it.next();
            JSONObject r = removed.optJSONObject(ipid);
            if (r == null || now - r.optLong("t", 0) > REMOVED_TTL_MS) drop.add(ipid);
        }
        for (String ipid : drop) removed.remove(ipid);
        trim(removed, MAX_REMOVED);

        prefs.edit().putString("published", nextPublished.toString()).putString("removed", removed.toString()).apply();
    }

    private static void delete(ContentResolver cr, long id) {
        try {
            cr.delete(TvContractCompat.buildWatchNextProgramUri(id), null, null);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo borrar una tarjeta de Watch Next", e);
        }
    }

    private static WatchNextProgram buildWatchNext(Context ctx, String profile, String ipid, Item it) {
        int wnType;
        switch (it.kind) {
            case "next":
                wnType = TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_NEXT;
                break;
            case "new":
                wnType = TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_NEW;
                break;
            default:
                wnType = TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE;
        }
        boolean series = "series".equals(it.type);
        WatchNextProgram.Builder b = new WatchNextProgram.Builder();
        b
            .setWatchNextType(wnType)
            .setType(
                series ? TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE : TvContractCompat.PreviewPrograms.TYPE_MOVIE
            )
            .setTitle(it.title)
            .setInternalProviderId(ipid)
            .setLastEngagementTimeUtcMillis(it.lastEngagement > 0 ? it.lastEngagement : System.currentTimeMillis())
            .setIntent(DeepLink.intent(ctx, it.path, profile));
        if (series) {
            if (it.episodeTitle != null) b.setEpisodeTitle(it.episodeTitle);
            if (it.season > 0) b.setSeasonNumber(it.season);
            if (it.episode > 0) b.setEpisodeNumber(it.episode);
        }
        if (it.image != null) {
            b.setPosterArtUri(Uri.parse(it.image)).setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9);
        } else if (it.poster != null) {
            b.setPosterArtUri(Uri.parse(it.poster)).setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_2_3);
        }
        if (wnType == TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE) {
            b.setLastPlaybackPositionMillis((int) it.positionMs);
            if (it.durationMs > 0) b.setDurationMillis((int) it.durationMs);
        } else if (it.durationMs > 0) {
            b.setDurationMillis((int) it.durationMs);
        }
        return b.build();
    }

    private static String kindOf(int watchNextType) {
        if (watchNextType == TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_NEXT) return "next";
        if (watchNextType == TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_NEW) return "new";
        return "continue";
    }

    private static String fingerprint(Item it) {
        return (
            it.kind + '\n' + it.type + '\n' + it.title + '\n' + it.episodeTitle + '\n' + it.season + '\n' + it.episode +
            '\n' + it.image + '\n' + it.poster + '\n' + it.positionMs + '\n' + it.durationMs + '\n' + it.lastEngagement +
            '\n' + it.path
        );
    }

    // ───────────────────────── utilidades ─────────────────────────

    private static JSONObject json(SharedPreferences prefs, String key) {
        try {
            return new JSONObject(prefs.getString(key, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static void trim(JSONObject o, int max) {
        if (o.length() <= max) return;
        List<String> keys = new ArrayList<>();
        for (Iterator<String> it = o.keys(); it.hasNext(); ) keys.add(it.next());
        // org.json en Android guarda el orden de inserción: se van los más viejos.
        for (int i = 0; i < keys.size() - max; i++) o.remove(keys.get(i));
    }
}
