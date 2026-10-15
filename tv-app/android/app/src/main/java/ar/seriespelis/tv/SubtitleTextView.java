package ar.seriespelis.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.text.Layout;
import android.text.TextPaint;
import android.util.AttributeSet;
import androidx.appcompat.widget.AppCompatTextView;

/** Texto de los subtítulos externos, con borde negro opcional (como "Contorno" en la web). */
public class SubtitleTextView extends AppCompatTextView {

    private float outlineWidth;

    public SubtitleTextView(Context context) {
        super(context);
    }

    public SubtitleTextView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    /** 0 = sin borde. */
    void setOutlineWidth(float px) {
        if (outlineWidth == px) return;
        outlineWidth = px;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        Layout layout = getLayout();
        if (outlineWidth > 0 && layout != null) {
            // Primero el trazo negro y encima el texto normal.
            TextPaint p = getPaint();
            int color = p.getColor();
            Paint.Style style = p.getStyle();
            float width = p.getStrokeWidth();
            Paint.Join join = p.getStrokeJoin();
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeJoin(Paint.Join.ROUND);
            p.setStrokeWidth(outlineWidth);
            p.setColor(Color.BLACK);
            canvas.save();
            canvas.translate(getCompoundPaddingLeft(), getExtendedPaddingTop());
            layout.draw(canvas);
            canvas.restore();
            p.setStyle(style);
            p.setStrokeWidth(width);
            p.setStrokeJoin(join);
            p.setColor(color);
        }
        super.onDraw(canvas);
    }
}
