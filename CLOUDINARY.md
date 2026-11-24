# Responsive images with Cloudinary

/Users/paulapplegate/Documents/Nextjs-jxl-working-checkout/

This project serves blog images through Cloudinary as responsive `<picture>` elements.

For every image, the browser is offered three formats in this order:

1. **JPEG XL** (`image/jxl`) — best compression, but limited browser support.
2. **AVIF** (`image/avif`) — excellent compression and wide modern support.
3. **WebP** (`image/webp`) — the safe modern fallback.

The browser picks the first format it supports, then picks the best width for the
space using `sizes` and `srcset`. It does **not** download all three formats.

The `<img>` at the bottom is always a WebP image, so the picture still works in
older browsers.

---

## What is already set up

| File                                    | Purpose                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/components/cloudinary-picture.tsx` | Builds the Cloudinary URLs and the JXL → AVIF → WebP `<picture>` used by the React component.          |
| `src/lib/rehype-cloudinary-picture.ts`  | Renders `<cloudinary-picture>` tags in MDX to the same JXL → AVIF → WebP `<picture>` at build time.    |
| `src/components/post-image.tsx`         | Chooses Cloudinary when the image has breakpoint data; otherwise falls back to Next.js image handling. |
| `src/data/cloudinary-breakpoints.json`  | Generated list of Cloudinary widths for each image.                                                    |
| `scripts/cloudinary-breakpoints.mjs`    | Uploads an image to Cloudinary, generates its widths, and prints a paste-ready snippet.                |
| `.env.local`                            | Private Cloudinary credentials. Never commit this file.                                                |

The three current thumbnails are already uploaded and have manifest entries:

- `thumbnails/laptop-ai-workspace`
- `thumbnails/laptop-computer-on-table`
- `thumbnails/pen-writing-on-notebook`

---

## Run the site

From this folder:

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

To check the production build:

```bash
pnpm build
pnpm serve
```

---

## Add a new image

The easy path is to put the image in `public/thumbnails/`.

1. Add the file, for example:

   `public/thumbnails/my-photo.jpg`

2. Use it in a post’s front matter:

   ```yaml
   thumbnail: /thumbnails/my-photo.jpg
   ```

   Or inside the Markdown body:

   ```md
   ![Describe the photo](/thumbnails/my-photo.jpg)
   ```

3. Upload it and generate responsive widths:

   ```bash
   pnpm cloudinary:breakpoints public/thumbnails/my-photo.jpg
   ```

4. Restart the dev server if it is already running.

The command writes the new widths into
`src/data/cloudinary-breakpoints.json` and prints a ready-to-paste
`<cloudinary-picture>` snippet. Keep the JSON file with the site.

To process every image under `public/` and `src/assets/images/` at once:

```bash
pnpm cloudinary:breakpoints
```

### The `<cloudinary-picture>` tag

Paste the printed snippet into an MDX post and replace the alt text:

```mdx
<cloudinary-picture
  src="thumbnails/my-photo"
  alt="Describe the photo"
  width="4000"
  height="2667"
  sizes="(min-width: 768px) 720px, 100vw"
  breakpoints="200, 455, 637, 784, 917, 1058, 1197, 1240"
  picture-class="responsive-picture"
/>
```

No import is needed. At build time the tag becomes a normal `<picture>` with
JXL, AVIF, and WebP sources and a WebP `<img>` fallback, so it works without
JavaScript. The `src` can be any of these forms:

- `thumbnails/my-photo` — the Cloudinary public ID
- `public/thumbnails/my-photo.jpg` — the local file path
- `/thumbnails/my-photo.jpg` — the URL path used by Markdown images
- `assets/images/my-photo` — an image under `src/assets/images/`

`width`, `height`, and `breakpoints` are optional when the image already has an
entry in `src/data/cloudinary-breakpoints.json`; the tag reads them from the
manifest. Keep them in the snippet if you want the post to be self-contained.

Useful attributes:

| Attribute       | Purpose                                                             |
| --------------- | ------------------------------------------------------------------- |
| `sizes`         | Tells the browser how wide the image is at each viewport.           |
| `breakpoints`   | Comma-separated widths from the upload command.                     |
| `picture-class` | Class applied to the `<picture>`; `responsive-picture` is built in. |
| `class`         | Class applied to the `<img>`.                                       |
| `loading`       | `lazy` (default) or `eager`.                                        |
| `priority`      | Shorthand for eager loading plus high fetch priority.               |
| `decoding`      | `async` (default) or `sync`.                                        |

To print a different `sizes` value from the command, pass `--sizes`:

```bash
pnpm cloudinary:breakpoints public/thumbnails/my-photo.jpg --sizes="100vw"
```

### Source-only images

If you keep the original file in `src/assets/images/` instead of `public/`, use
`src/assets/images/my-photo.jpg` as the path. The component maps it to the
Cloudinary public ID `assets/images/my-photo`.

---

## Credentials

Create `.env.local` in this folder if it is missing:

```dotenv
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is safe to expose; it appears in every image URL.
- `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are private. They are only used by the local upload command.
- The deployed site only needs the public cloud name at build time.

`.env.local` is ignored by Git. `.env.example` shows the variable names without secrets.

---

## Troubleshooting

**Images show an `/_next/image?...` URL or a JPG instead of Cloudinary**

The image is using the fallback. Check:

- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is set in `.env.local`.
- The image’s public ID exists in `src/data/cloudinary-breakpoints.json`.
- The public ID matches the file path. For example, `/thumbnails/my-photo.jpg` maps to `thumbnails/my-photo`.

**The upload command says it cannot find the file**

Run the command from the project root and use a path inside `public/` or
`src/assets/images/`.

**The build says `no breakpoints found` for a `<cloudinary-picture>` tag**

Run the upload command for that image first, or add the printed `breakpoints`
attribute to the tag. Plain Markdown images (`![alt](/path.jpg)`) do not need
the tag; they use the same manifest automatically.

**The build says `a non-empty alt is required`**

`<cloudinary-picture>` deliberately refuses an empty alt. Replace the
`alt="TODO: describe this image"` placeholder before building.

**The build says `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not set`**

Add the cloud name to `.env.local`, then restart the build or dev server.

**JXL does not display**

That is expected in browsers without JPEG XL support. The browser automatically
chooses AVIF or WebP instead.

**Cloudinary rejects the upload**

Check the key and secret in `.env.local`, and make sure the file is under 10 MB
for the free plan.

---

## Format support notes

- JXL: Safari 17+; not supported by Chrome or Firefox at normal settings.
- AVIF: Chrome, Edge, Firefox, and Safari 16+.
- WebP: supported by all current browsers.

Because JPEG XL support is still limited, the AVIF and WebP fallbacks are essential.
Do not remove them.
