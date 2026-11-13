# Hair Gloss Lab v0.2

Browser-only exploratory PSD / Differential Box Counting comparison. Media never leave the browser. No runtime dependencies, build step or external scripts.

## Use
Serve this directory (`python3 -m http.server 8000`) or use GitHub Pages. Select multiple images/videos, choose a source, then register its image/current video frame in each scene. Native video controls support playback and seeking. Choose 2–9 scenes, independent names and square pointer/touch ROIs. Reducing the count retains hidden scenes in memory; reload clears all media. “次と入れ替え” swaps complete scenes. “削除” clears the selected scene. Analyze again after changing ROI or resolution. Unassigned scenes are skipped. Default ROI is the centered maximal square; minimum side is 5 original pixels. Coordinates are in the decoded source image, including browser orientation handling.

Monochrome display defaults ON; OFF retains color display only. Both modes analyze the same scalar Rec.709 encoded-RGB luma, not RGB channels or radiometrically linear luminance. Transparent images are composited on white. Canvas resizes the square to 128, 256 or 512 pixels; each value is rounded to 8bit using 0.2126R+0.7152G+0.0722B, then divided by 255. Exported RGB PNG has identical grayscale channels and is the authoritative analysis input. Browser resizing/color management may vary; use the exported PNG for numerical comparisons.

## PSD definition
Subtract the unwindowed mean, apply separable symmetric Hann w(j)=0.5−0.5 cos(2πj/(N−1)), then unnormalized forward 2D FFT. Power is |FFT|² without window-energy or N normalization. Radial bins use floor(sqrt(kx²+ky²)), wrapped FFT indices, and arithmetic mean power per bin, for radius 2 through N/2−1. Frequency is bin radius/N cycles per resized pixel. Fit log10(power) vs log10(frequency), inclusively 4/N to 0.25; β is negative slope. Zero-power bins are excluded, not replaced by an arbitrary floor. Fewer than two usable points gives null β/R². Constant-response R² is undefined (null). Fits use ordinary least squares.

## DBC definition
Based on the differential box-counting approach of Sarkar & Chaudhuri, “An efficient differential box-counting approach to compute fractal dimension of image”, IEEE Transactions on Systems, Man, and Cybernetics 24(1), 115–120 (1994). This implementation specifies a normalized-height variant: square spatial boxes s=2,4,…,N/4; normalized luminance height bins h=s/N; count floor(max/h)−floor(min/h)+1 in each spatial box. Endpoint luminance 1 is assigned floor(1/h), with no clamping. Sum counts to N(r), r=s/N. Sizes divide N exactly, so no partial boundary boxes or padding. Fit all scales log10 N(r) vs log10(1/r); slope is D. This explicit variant should not be assumed identical to all published DBC variants.

## Export and verification
Summary, PSD and DBC CSV include scene ID/name, source filename, video time, ROI coordinates and resolution. Curve CSV includes fit membership. JSON includes all log-space data, fits, ranges and algorithm parameters. ROI PNG and comparison graph PNG are available separately and as multiple-file downloads. Browsers may require permission for multiple downloads; individual ROI buttons are available. ZIP export is not implemented.

Run `node --check app.js`, `node --check analysis.js`, `node validation/test.cjs`. Artificial-image tests check constant-image D=2, undefined constant PSD, sinusoidal peak and impulse FFT at all supported resolutions. These are limited known-property checks, not proof of research validity.

MATLAB: `out = validate_roi('A_roi.png')` in `validation/` uses MATLAB fft2 and polyfit independently. Compare its power/count tables and fits with exported CSV/JSON. MATLAB execution and cross-language agreement have **not** been verified. Agreement testing is distinct from known-property validity testing. Metrics are not direct measures of perceived gloss.

## Tested in this cloud session
Chromium desktop and 390×844 mobile viewport: image decode, registration, 2/9-scene analysis and JSON download. Chromium: H.264 MP4 decode, seek/capture, mouse ROI, CSV and ROI PNG download. Syntax and artificial-image unit tests pass. Actual iPhone/Safari, HEIC/MOV codec behavior, physical touch gestures and graph PNG downloads are not verified. Unsupported media show a conversion suggestion. No production inference validation has been performed.

## Deployment
GitHub Pages: main branch, root directory. Public URL: https://kkodamalab.github.io/hair-gloss-lab/
