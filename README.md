# Hair Gloss Lab — PSD × DBC

Browser-only exploratory comparison of spatial brightness structure in two video frames or image ROIs.

## How to use
1. Load a local video or image.
2. Select the A and B frames (images initialize both).
3. Drag a rectangular ROI on each image.
4. Choose analysis resolution and run PSD / DBC.
5. Export summary CSV or full JSON.

All source media remain in the browser; the app does not upload them.

## Research status
**Prototype, not validated for research inference.** PSD uses a mean-subtracted Hann-windowed 2D FFT and radial averaging; β is the negative log-log regression slope over a fixed frequency range. DBC uses grayscale height binning over dyadic box sizes and a log-log slope. ROI is resized to a square, potentially changing spatial structure. Validate the full algorithm and intermediate curves against an independent MATLAB/R implementation and synthetic images before drawing conclusions. These metrics are not direct measurements of perceived gloss.

## GitHub Pages
Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save.
