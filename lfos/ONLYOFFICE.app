{
  "schemaVersion": 1,
  "name": "ONLYOFFICE",
  "url": "https://YOUR-PROJECT.vercel.app",
  "icon": "https://YOUR-PROJECT.vercel.app/icon.svg",
  "displayMode": "standalone",
  "embedPolicy": "embed",
  "defaultZoom": 100,
  "rememberWindowBounds": true,
  "windowChrome": {
    "mode": "overlay",
    "background": "surface"
  },
  "permissions": ["files:open", "files:save"],
  "fileAssociations": [
    {
      "extensions": [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"],
      "mimeTypes": [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ],
      "default": false
    }
  ]
}
