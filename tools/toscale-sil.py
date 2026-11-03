# TO SCALE: turn the side-profile cut-out photos (games/toscale/photos/<id>.webp) into crisp silhouette masks
# (games/toscale/sil/<id>.png, white on transparent; the game tints them). Hardens the alpha, drops specks, trims.
#   python tools/toscale-sil.py            (needs Pillow, numpy, scipy)
import os, glob
import numpy as np
from PIL import Image
from scipy import ndimage

root = os.path.join(os.path.dirname(__file__), '..', 'games', 'toscale')
os.makedirs(os.path.join(root, 'sil'), exist_ok=True)
for p in sorted(glob.glob(os.path.join(root, 'photos', '*.webp'))):
    id = os.path.basename(p)[:-5]
    a = np.array(Image.open(p).convert('RGBA'))[..., 3] > 128
    lab, n = ndimage.label(a)
    if n:
        sizes = ndimage.sum(a, lab, range(1, n + 1))
        a = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.04])
    ys, xs = np.where(a)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    out = np.zeros(a.shape + (4,), np.uint8); out[..., :3] = 255; out[..., 3] = a * 255
    Image.fromarray(out).save(os.path.join(root, 'sil', id + '.png'), optimize=True)
    print(id, a.shape[1], 'x', a.shape[0])
