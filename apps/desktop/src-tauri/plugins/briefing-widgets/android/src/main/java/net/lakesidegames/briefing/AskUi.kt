package net.lakesidegames.briefing

import android.content.Context
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.view.ContextThemeWrapper
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import androidx.core.widget.TextViewCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.DynamicColors
import com.google.android.material.color.MaterialColors
import com.google.android.material.textview.MaterialTextView

/**
 * The sheet's design tokens, read from a Material 3 theme: the system's
 * dynamic surfaces where the device has them, AHD red as the accent.
 */
internal class AskUi private constructor(val context: Context) {
  private val density = context.resources.displayMetrics.density

  val night: Boolean = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

  fun dp(value: Int): Int = (value * density + 0.5f).toInt()
  fun dpf(value: Float): Float = value * density

  fun color(attr: Int, fallback: Int = Color.GRAY): Int = MaterialColors.getColor(context, attr, fallback)

  val primary get() = color(androidx.appcompat.R.attr.colorPrimary, AHD_RED)
  val onPrimary get() = color(com.google.android.material.R.attr.colorOnPrimary, Color.WHITE)
  val primaryContainer get() = color(com.google.android.material.R.attr.colorPrimaryContainer)
  val onPrimaryContainer get() = color(com.google.android.material.R.attr.colorOnPrimaryContainer)
  val secondaryContainer get() = color(com.google.android.material.R.attr.colorSecondaryContainer)
  val onSecondaryContainer get() = color(com.google.android.material.R.attr.colorOnSecondaryContainer)
  val tertiary get() = color(com.google.android.material.R.attr.colorTertiary)
  val surface get() = color(com.google.android.material.R.attr.colorSurface)
  val onSurface get() = color(com.google.android.material.R.attr.colorOnSurface)
  val onSurfaceVariant get() = color(com.google.android.material.R.attr.colorOnSurfaceVariant)
  val outline get() = color(com.google.android.material.R.attr.colorOutline)
  val outlineVariant get() = color(com.google.android.material.R.attr.colorOutlineVariant)
  val containerLow get() = color(com.google.android.material.R.attr.colorSurfaceContainerLow)
  val container get() = color(com.google.android.material.R.attr.colorSurfaceContainer)
  val containerHigh get() = color(com.google.android.material.R.attr.colorSurfaceContainerHigh)
  val containerHighest get() = color(com.google.android.material.R.attr.colorSurfaceContainerHighest)
  val error get() = color(androidx.appcompat.R.attr.colorError, Color.RED)
  val errorContainer get() = color(com.google.android.material.R.attr.colorErrorContainer)
  val onErrorContainer get() = color(com.google.android.material.R.attr.colorOnErrorContainer)

  /** AHD red for the filled accents in both modes, where M3 would go pastel in dark. */
  val accent get() = ContextCompat.getColor(context, R.color.ask_accent)
  val onAccent get() = ContextCompat.getColor(context, R.color.ask_on_accent)
  /** Links need more contrast than AHD red has on a dark surface. */
  val link get() = ContextCompat.getColor(context, R.color.ask_link)

  fun withAlpha(color: Int, alpha: Float): Int = ColorUtils.setAlphaComponent(color, (alpha * 255).toInt())

  fun text(value: CharSequence = "", appearance: Int = Type.BODY_LARGE, color: Int = onSurface): MaterialTextView =
    MaterialTextView(context).apply {
      TextViewCompat.setTextAppearance(this, styleOf(appearance))
      setTextColor(color)
      text = value
    }

  fun styleOf(attr: Int): Int {
    val value = TypedValue()
    return if (context.theme.resolveAttribute(attr, value, true)) value.resourceId else 0
  }

  fun icon(res: Int, tint: Int): Drawable? = ContextCompat.getDrawable(context, res)?.mutate()?.apply { setTint(tint) }

  fun rounded(color: Int, radius: Float, stroke: Int? = null, strokeWidth: Int = 1): GradientDrawable = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dpf(radius)
    if (stroke != null) setStroke(dp(strokeWidth), stroke)
  }

  fun circle(color: Int): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(color)
  }

  /** A 48dp icon button with a TalkBack label and a ripple. */
  fun iconButton(res: Int, label: String, tint: Int = onSurfaceVariant, onTap: () -> Unit): MaterialButton =
    MaterialButton(context, null, com.google.android.material.R.attr.materialIconButtonStyle).apply {
      icon = ContextCompat.getDrawable(context, res)
      iconTint = ColorStateList.valueOf(tint)
      iconSize = dp(20)
      contentDescription = label
      TooltipCompatSafe.set(this, label)
      minimumWidth = dp(48)
      minimumHeight = dp(48)
      minWidth = dp(48)
      minHeight = dp(48)
      insetTop = 0
      insetBottom = 0
      setPadding(dp(14), dp(14), dp(14), dp(14))
      setOnClickListener { NativeSafety.run("Ask $label") { onTap() } }
    }

  fun filledButton(label: String, onTap: () -> Unit): MaterialButton = MaterialButton(context).apply {
    text = label
    backgroundTintList = ColorStateList.valueOf(accent)
    setTextColor(onAccent)
    minHeight = dp(48)
    setOnClickListener { NativeSafety.run("Ask $label") { onTap() } }
  }

  fun outlinedButton(label: String, onTap: () -> Unit): MaterialButton =
    MaterialButton(context, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
      text = label
      minHeight = dp(48)
      setOnClickListener { NativeSafety.run("Ask $label") { onTap() } }
    }

  fun textButton(label: String, onTap: () -> Unit): MaterialButton =
    MaterialButton(context, null, com.google.android.material.R.attr.borderlessButtonStyle).apply {
      text = label
      minHeight = dp(48)
      setTextColor(link)
      setOnClickListener { NativeSafety.run("Ask $label") { onTap() } }
    }

  fun iconView(res: Int, tint: Int, size: Int): ImageView = ImageView(context).apply {
    setImageDrawable(icon(res, tint))
    layoutParams = LinearLayout.LayoutParams(dp(size), dp(size))
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  /** A tonal circle holding an icon, for empty states. */
  fun badge(res: Int, size: Int = 56): View = android.widget.FrameLayout(context).apply {
    background = circle(secondaryContainer)
    addView(ImageView(context).apply {
      setImageDrawable(icon(res, onSecondaryContainer))
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }, android.widget.FrameLayout.LayoutParams(dp(size / 2 - 2), dp(size / 2 - 2), Gravity.CENTER))
    layoutParams = LinearLayout.LayoutParams(dp(size), dp(size))
  }

  fun vertical(): LinearLayout = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
  fun horizontal(): LinearLayout = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }

  fun matchWrap(top: Int = 0, bottom: Int = 0) = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
    topMargin = dp(top); bottomMargin = dp(bottom)
  }

  fun wrap(top: Int = 0, bottom: Int = 0) = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
    topMargin = dp(top); bottomMargin = dp(bottom)
  }

  /** Material's emphasized-decelerate curve for things arriving on screen. */
  fun arrive(view: View, delay: Long = 0) {
    view.alpha = 0f
    view.translationY = dpf(12f)
    view.animate().alpha(1f).translationY(0f).setStartDelay(delay).setDuration(260)
      .setInterpolator(PathInterpolator(0.05f, 0.7f, 0.1f, 1f)).start()
  }

  val mono: Typeface = Typeface.MONOSPACE

  object Type {
    val DISPLAY_SMALL = com.google.android.material.R.attr.textAppearanceDisplaySmall
    val HEADLINE_SMALL = com.google.android.material.R.attr.textAppearanceHeadlineSmall
    val TITLE_LARGE = com.google.android.material.R.attr.textAppearanceTitleLarge
    val TITLE_MEDIUM = com.google.android.material.R.attr.textAppearanceTitleMedium
    val TITLE_SMALL = com.google.android.material.R.attr.textAppearanceTitleSmall
    val BODY_LARGE = com.google.android.material.R.attr.textAppearanceBodyLarge
    val BODY_MEDIUM = com.google.android.material.R.attr.textAppearanceBodyMedium
    val BODY_SMALL = com.google.android.material.R.attr.textAppearanceBodySmall
    val LABEL_LARGE = com.google.android.material.R.attr.textAppearanceLabelLarge
    val LABEL_MEDIUM = com.google.android.material.R.attr.textAppearanceLabelMedium
    val LABEL_SMALL = com.google.android.material.R.attr.textAppearanceLabelSmall
  }

  companion object {
    const val AHD_RED = 0xFFC8202F.toInt()

    /**
     * Material 3 day/night, the device's dynamic colors where available,
     * then AHD red laid over the primary roles so the accent never drifts to
     * the wallpaper.
     */
    fun themed(base: Context): AskUi {
      val material = ContextThemeWrapper(base, R.style.Theme_AHDAsk)
      val dynamic = NativeSafety.get("Ask dynamic color", material as Context) {
        if (DynamicColors.isDynamicColorAvailable()) DynamicColors.wrapContextIfAvailable(material) else material
      }
      return AskUi(ContextThemeWrapper(dynamic, R.style.ThemeOverlay_AHDAsk_Accent))
    }
  }
}

/** Tooltips are API 26+ natively; the compat helper covers older devices. */
internal object TooltipCompatSafe {
  fun set(view: View, text: CharSequence) {
    NativeSafety.run("Ask tooltip") { androidx.appcompat.widget.TooltipCompat.setTooltipText(view, text) }
  }
}
