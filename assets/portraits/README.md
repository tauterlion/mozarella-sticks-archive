# Portrait uploads — no registration required

The directory and every profile automatically request `assets/portraits/<canonical-id>.jpg`. Missing files show a silhouette and do not fail validation. No portrait belongs in `data/media.json` unless it independently is an approved historical archive record.

1. Export a JPG, ideally **1200 × 1600 (3:4)**, around 350 KB and preferably no more than 500 KB.
2. Name it using the exact lowercase canonical ID in `data/people.json`, followed by `.jpg`. Examples: `libby.jpg` is Elizabeth Macbeth; `dash.jpg` is Reid Dashel Greenberg; `charlee.jpg` is Charleston Robison; `valentina.jpg` is Valentina Correa.
3. In GitHub, create/switch to a working branch. Open **assets → portraits**, then **Add file → Upload files**. Upload the JPG and commit it to that branch.
4. Open a portrait-only pull request. Review the image, its intended public use, and validation. Merge only when approved. The existing Pages deployment then publishes the file.
5. Reload the site after deployment. The photo appears in both People and the individual profile, even if a silhouette appeared before.

**No HTML, JavaScript, CSS, people JSON, profile metadata, media JSON, or Media Manager edits are needed.** Missing portraits are retried on a new page load; failures are not persisted in local storage.

If a photo does not appear, check exact filename/case (`libby.jpg`, not `Libby.JPG`), folder, completed deployment and browser cache; try a hard reload. Supported automatic format is JPG. Alternate extensions need an explicit future implementation.

Only nearby carousel portraits are requested initially (the center plus three on each side); more load when approached. Each profile loads its portrait directly. Images use a centered crop, favoring the upper part of the frame. Keep faces away from extreme edges and leave room at the bottom for directory labels.

The initial Revision 3 handoff contained no portrait originals; a first batch of 16 JPGs has since been uploaded to the draft branch. Tests preserve existing originals and use temporary fixtures only for people without a JPG. Those test images are removed after testing and are not committed here.
