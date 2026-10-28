# Design foundation contrast ratios

Measured from the design token hex values using WCAG relative luminance (sRGB linearization). Text pairs exceed the WCAG AA 4.5:1 threshold. Focus-ring pairs exceed the 3:1 non-text threshold.

| Foreground / use | Foreground | Background | Contrast |
| --- | --- | --- | ---: |
| Body text | `#14201B` | `#FAF7F0` | 15.67:1 |
| Primary button text | `#FFFFFF` | `#0F3D2E` | 12.16:1 |
| App bar text | `#FFFFFF` | `#0A2A20` | 15.39:1 |
| Muted text | `#46534D` | `#EEF1ED` | 7.08:1 |
| Success text | `#14532D` | `#DCFCE7` | 8.30:1 |
| Warning text | `#713F12` | `#FEF3C7` | 7.79:1 |
| Danger text | `#7F1D1D` | `#FEE2E2` | 8.20:1 |
| Info text | `#1E3A8A` | `#DBEAFE` | 8.49:1 |
| Text on gold fill | `#14201B` | `#C8A24A` | 6.97:1 |
| Light-surface focus ring | `#0F3D2E` | `#FAF7F0` | 11.36:1 |
| Dark-surface focus ring | `#C8A24A` | `#0A2A20` | 6.39:1 |

Prompt 10 should still run automated contrast checks against rendered screens, since component-specific pairings may differ from these foundation tokens.
