package ar.flix.tv;

import android.text.Html;
import android.text.Spanned;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lee el WebVTT que manda la web (subtítulos externos, ya convertidos a VTT). Solo lo necesario:
 * tiempos, texto y <i>/<b>/<u>; el resto de las etiquetas y los ajustes de posición se ignoran.
 */
final class VttParser {

    static final class Cue {
        final long startMs;
        final long endMs;
        final CharSequence text;

        Cue(long startMs, long endMs, CharSequence text) {
            this.startMs = startMs;
            this.endMs = endMs;
            this.text = text;
        }
    }

    // 01:02:03.456 o 02:03.456 (también con coma, por si llega algo con estilo SRT).
    private static final String TIME = "(?:(\\d+):)?(\\d{1,2}):(\\d{1,2})[.,](\\d{1,3})";
    private static final Pattern TIMING = Pattern.compile("^\\s*" + TIME + "\\s*-->\\s*" + TIME);
    // Etiquetas que se conservan; todo lo demás (<c.x>, <v Nombre>, <00:01.000>, <font>…) se saca.
    private static final Pattern TAG = Pattern.compile("<(/?)([^>\\s.]*)[^>]*>");

    private VttParser() {}

    static List<Cue> parse(String vtt) {
        List<Cue> cues = new ArrayList<>();
        if (vtt == null) return cues;
        String[] lines = vtt.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
        int i = 0;
        while (i < lines.length) {
            Matcher m = TIMING.matcher(lines[i]);
            if (!m.find()) {
                i++;
                continue;
            }
            long start = time(m, 1);
            long end = time(m, 5);
            i++;
            StringBuilder text = new StringBuilder();
            while (i < lines.length && !lines[i].trim().isEmpty()) {
                // Un bloque sin línea en blanco antes del siguiente tiempo: se corta igual.
                if (TIMING.matcher(lines[i]).find()) break;
                if (text.length() > 0) text.append("<br>");
                text.append(clean(lines[i]));
                i++;
            }
            if (end > start && text.length() > 0) cues.add(new Cue(start, end, html(text.toString())));
        }
        Collections.sort(cues, (a, b) -> Long.compare(a.startMs, b.startMs));
        return cues;
    }

    private static long time(Matcher m, int g) {
        long h = m.group(g) != null ? Long.parseLong(m.group(g)) : 0;
        long min = Long.parseLong(m.group(g + 1));
        long s = Long.parseLong(m.group(g + 2));
        String frac = m.group(g + 3);
        long ms = Long.parseLong(frac);
        if (frac.length() == 1) ms *= 100;
        else if (frac.length() == 2) ms *= 10;
        return ((h * 60 + min) * 60 + s) * 1000 + ms;
    }

    private static String clean(String line) {
        Matcher m = TAG.matcher(line);
        StringBuffer out = new StringBuffer();
        while (m.find()) {
            String name = m.group(2).toLowerCase(java.util.Locale.ROOT);
            String keep = "i".equals(name) || "b".equals(name) || "u".equals(name) ? "<" + m.group(1) + name + ">" : "";
            m.appendReplacement(out, Matcher.quoteReplacement(keep));
        }
        m.appendTail(out);
        return out.toString();
    }

    private static CharSequence html(String s) {
        Spanned sp = Html.fromHtml(s, Html.FROM_HTML_MODE_LEGACY);
        int end = sp.length();
        while (end > 0 && Character.isWhitespace(sp.charAt(end - 1))) end--;
        return sp.subSequence(0, end);
    }
}
