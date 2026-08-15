# ONLYOFFICE for LFOS

A browser-based ONLYOFFICE editor adapted for LFOS. Documents are converted and edited locally with WebAssembly; LFOS file handles are used when the app runs inside LFOS, with standard browser file pickers as a fallback.


[English](README.md)


## ✨ Key Features

- 🔒 **Privacy-First**: All document processing happens locally in your browser, with no uploads to any server
- 📝 **Multi-Format Support**: Supports DOCX, XLSX, PPTX, and many other document formats
- ⚡ **Real-Time Editing**: Provides smooth real-time document editing experience
- 🚀 **No Server Required**: Pure frontend implementation with no server-side processing needed
- 🎯 **Ready to Use**: Start editing documents immediately by opening the webpage
- 🗂️ **LFOS Integration**: Opens launch-activated files and uses the LFOS virtual drive for open/save
- 🌐 **English UI**: The app shell and ONLYOFFICE editor default to English

## 🛠️ Technical Architecture

This project is built on the following core technologies:

- **OnlyOffice SDK**: Provides powerful document editing capabilities
- **WebAssembly**: Implements document format conversion through x2t-wasm
- **Pure Frontend Architecture**: All functionality runs in the browser

## 📄 Opening Remote Files

### Functionality

Automatically downloads and opens remote Office files (e.g., `.docx`, `.pptx`) via route parameters, converting them into `File` objects for further use (e.g., preview or editing).

### Usage

The page URL must include the following parameters:

- `url` (required): Remote file address
- `filename` (optional): File name; if not provided, it will attempt to auto-resolve

Example:
[00.xlsx](https://sweetwisdom.github.io/onlyoffice-web-local/#/?url=https://sweetwisdom.github.io/react-filePreview/filePreview/00.xlsx)

```
?filename=00.pptx&url=https://example.com/files/00.pptx
```

### File Name Retrieval Priority

1. Route parameter `filename`
2. Parsed from `url`
3. Extracted from response header `Content-Disposition`

If the file name cannot be retrieved, the operation will terminate with an error prompt.

## Word

![recording](./.imgs/recording.gif)

## Excel

![image-20250524104950359](./.imgs/image-20250524104950359.png)

## PPT

![image-20250524105044644](./.imgs/image-20250524105044644.png)

## Export Document

![image-20250524104854846](./.imgs/image-20250524104854846.png)

## Development Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

Development builds use the LFOS SDK served by `http://127.0.0.1:3000` so the app and local shell stay on the same protocol version. When LFOS runs elsewhere, set `VITE_LFOS_SDK_URL` explicitly:

```sh
VITE_LFOS_SDK_URL=http://localhost:3001/sdk/v1/lfos.js pnpm dev
```

Production builds use `https://os.linecoflow.com/sdk/v1/lfos.js` unless the same variable is set during the build.

### Type-Check, Compile, and Minify for Production

```sh
pnpm build
```

The production output is written to `html/`.

## Deploy to Vercel

The repository includes `vercel.json`; importing the repository into Vercel is sufficient. Vercel runs `pnpm install --frozen-lockfile`, builds the Vite app, and serves `html/`.

The deployment sets the correct `application/wasm` content type and intentionally does not emit `X-Frame-Options` or a restrictive `frame-ancestors` policy, so LFOS can embed the app.

At build time, `scripts/generate-lfos-manifest.mjs` writes `html/ONLYOFFICE.app` using Vercel's deployment URL. For a custom production domain, set this Vercel environment variable:

```text
LFOS_APP_URL=https://office.example.com
```

## Install in LFOS

LFOS currently consumes an editable `.app` JSON file in `/Applications`; it does not automatically discover a remote web manifest. After deploying:

1. In LFOS, open **Settings → Web apps**, enter `ONLYOFFICE` and the deployment's HTTPS URL, and choose **Add to Applications**.
2. In Finder, right-click the new `.app` file and choose **Edit Configuration**.
3. Copy the deployed `https://YOUR-DEPLOYMENT/ONLYOFFICE.app` configuration into it. You can also start from `lfos/ONLYOFFICE.app` and replace `YOUR-PROJECT`.

The configuration declares `files:open` and `files:save`, plus these Microsoft Office associations: `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, and `.pptx`. They are deliberately not marked as the default so the built-in LFOS Office handler is not silently replaced; users can choose ONLYOFFICE from **Open with…**. Change `default` to `true` only if this app should become the preferred handler.

When a document is launched through **Open with…** or selected with the LFOS open dialog, ONLYOFFICE retains its opaque LFOS handle. Normal **Save** writes back to that same virtual-drive location. A destination selector is used only for a new document, a browser-imported file, or **Save As**. Removing `files:save` from the installed configuration disables LFOS write-back.

The implementation follows the [LFOS hosted-app guide](https://os-docs.linecoflow.com/docs/getting-started/bring-your-web-app), [app configuration reference](https://os-docs.linecoflow.com/docs/reference/manifest), and [file-association guide](https://os-docs.linecoflow.com/docs/capabilities/file-associations).

## Docker Support

Build a custom image named `vue-local-office` (note: the `.` at the end of the command indicates using the Dockerfile in the current directory; adjust the path as needed):

```sh
docker build -t vue-local-office .
```

Map ports and start the Docker container (8080:80 maps the container's port 80 to the host's port 8080; `local-office` is the custom container name; `vue-local-office` is the custom image name):

```sh
docker run -dp 8080:80 --name local-office vue-local-office
```

After executing the above commands, open http://localhost:8080 in a browser to preview.

## Technical Details

- Uses `x2t-wasm` as a replacement for OnlyOffice services
- Utilizes OnlyOffice WebSDK for editing (sourced from `se-office`)

## References

- [Qihoo360/se-office: A full-featured office productivity suite based on open standards, enabling browser-based preview and editing of Office files.](https://github.com/Qihoo360/se-office)
- [cryptpad/onlyoffice-x2t-wasm: CryptPad WebAssembly file conversion tool](https://github.com/cryptpad/onlyoffice-x2t-wasm)
