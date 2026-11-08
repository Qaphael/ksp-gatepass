# Ticket zone measurement sheet

Fill this in from your design file when you have it (the system works with placeholders until then). All values in millimetres, measured from the **top-left corner of the trim edge** (the finished 210 x 59 mm ticket, not the bleed). If your design software measures from the bleed edge, subtract the bleed.

## File
| Question | Answer |
| --- | --- |
| File name and format (PNG or JPEG, RGB) | |
| Pixel size and dpi | |
| Trim size (expected 210 x 59 mm) | |
| Bleed included? How many mm each side? | |
| Where is the perforation line (x, mm)? | |

## QR zone (right of the main section, next to the stub)
| Question | Answer |
| --- | --- |
| Left edge x, top edge y | |
| Width and height of the space you left (the QR is a square, so the smaller side is the limit) | |
| Is there a solid light panel in the artwork behind it, or should the system draw a white panel? | |
| Anything in the artwork near it that must not be covered? | |

## Bottom strip (electronic data)
| Question | Answer |
| --- | --- |
| Left x, top y, width, height of the strip | |
| Background colour or image behind it (text colour must contrast) | |
| What should it show? Tick: serial, category, price, footer text, authenticity notice, other | |
| Text colour and preferred alignment | |

## Stub (blank in the artwork)
| Question | Answer |
| --- | --- |
| Left x, top y, width, height | |
| Background colour of the stub | |
| What should it show? Tick: serial, category, event name, date, other | |
| Should the text run horizontally or rotated 90 degrees? | |

## Fonts
List every font used in the artwork and send the font files (TTF or OTF) you are licensed to share, so the electronic text matches. If you have none, we will pick a close bundled font.

## How to measure
- **Photoshop:** View > Rulers, set units to millimetres, drag guides to each zone edge, read positions in the Info panel. Or use a rectangle and read X/Y/W/H in Properties.
- **Illustrator / Figma / Canva:** draw a rectangle over each zone, read X, Y, width and height (set units to mm; in Figma set the frame to 210 x 59 first).
- **Easiest:** add a layer to your file with coloured boxes named QR, BOTTOM and STUB over the empty areas, export it as a second PNG, and send both files. The values can be read from the boxes.
