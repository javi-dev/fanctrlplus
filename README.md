# **FanCtrl Plus** (Fork)

Fork of [ck9393/fanctrlplus](https://github.com/ck9393/fanctrlplus) with a focus on **noise reduction**, **modern UI**, and **security hardening**.

## What's different from upstream

### 🎯 2-Segment Piecewise Fan Curve

The original plugin uses a single linear ramp between Low and High temperature. This fork adds a **midpoint** (`mid_temp` / `mid_pwm`) that splits the curve into two segments:

```
Fan Speed
  100% ─                          ╱───── High (45°C)
       │                        ╱
  ~39% ─              ╱────────╱  ← Mid (43°C, PWM 100)
       │            ╱  Gentle     Steep
    0% ────────────╱    ramp       ramp
       └──────────────────────────────
       Low (39°C)   Mid (43°C)   High (45°C)
                Disk Temperature
```

- **Segment 1** (Low → Mid): gentle ramp, fans stay quiet during normal operation
- **Segment 2** (Mid → High): steep ramp, safety when approaching critical temps

This keeps the system silent under normal load while still spinning up aggressively when needed.

### 🔇 Hysteresis & PWM Smoothing

- **Hysteresis** (2°C): ignores temperature changes smaller than 2°C. Prevents fan speed oscillation when temp hovers at curve boundaries.
- **PWM ramping** (50 PWM/min): fans ramp gradually toward the target instead of jumping. Eliminates the acoustic "whoosh" of sudden speed changes. Scales with the configured interval.

### 🎨 Modern UI

- **CSS Grid/Flexbox** layout replaces `<table>`-based forms
- **CSS custom properties** for consistent theming
- **Full dark mode** — supports Unraid's Black and Gray themes via `prefers-color-scheme` and `Theme--black`/`Theme--gray` classes
- **Responsive** — 3 breakpoints (768px, 1024px, 1086px)
- **Zero inline styles** — all styling via CSS classes
- **No SweetAlert2** — chart modal uses native `<dialog>`, identify modal uses vanilla JS overlay
- **Zero external JS dependencies** beyond Chart.js and jQuery (which Unraid provides)

### 🔒 Security Hardening

- **PWM path whitelist** — `identify` and `savelabel` endpoints validate paths match `/sys/devices/.../pwm\d+$`
- **Input validation** — `delete` and `setsyslog` validate filenames match `fanctrlplus_*.cfg`
- **LOCK_EX** on all `file_put_contents` calls — prevents race condition corruption
- **`escapeshellarg`** on logger messages — prevents shell injection
- **`display_errors=0`** — no PHP error details leaked to browser
- **Division by zero protection** in CPU and disk temp range calculations

### 🐛 Bug Fixes (vs upstream)

- CSS grid alignment for 5-element temperature range (Low ~ Mid ~ High)
- Missing `?>` closing tag in disk title attribute (PHP parse error)
- Duplicate `$op` variable declaration removed
- `parse_ini_file` return value checked before array access
- `log_enable` read once at startup instead of grep per cycle

## Files modified vs upstream

| File | Changes |
|------|---------|
| `scripts/fanctrlplus_loop.sh` | Piecewise curve, hysteresis, PWM smoothing, div-by-zero fix |
| `include/FanBlockRender.php` | CSS Grid layout, mid_temp/mid_pwm fields |
| `include/FanctrlLogic.php` | PWM whitelist, input validation, LOCK_EX, display_errors |
| `include/update.fanctrlplus.php` | Save handler for mid_temp/mid_pwm, LOCK_EX |
| `include/chart-handler.js` | 2-segment chart with midpoint marker, native `<dialog>` |
| `css/fcp.base.css` | Complete rewrite: custom properties, dark mode, responsive |
| `fanctrlplus.page` | Modern UI, no SweetAlert2, no inline styles |
| `FanctrlPlus.Dashboard.page` | Inline styles replaced with CSS classes |

## Installation

Same as upstream — available in Community Apps (CA). Search for "**FanCtrl Plus**".

To install from this fork directly:

```bash
# Download the latest release txz
wget https://github.com/javi-dev/fanctrlplus/releases/latest/download/fanctrlplus-1.3.3-fork.txz

# Install
upgradepkg --install-new /boot/config/plugins/fanctrlplus/fanctrlplus-1.3.3-fork.txz
```

## Credits

Original plugin by [ck9393](https://github.com/ck9393/fanctrlplus).
