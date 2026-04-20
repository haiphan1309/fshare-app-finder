# Fshare App Finder

Website local để tìm nhanh app trong một folder Fshare cố định bằng cache local.

Folder hiện đang ghim:

- `https://www.fshare.vn/folder/XJNDMQJ8AEUU`

## Cách chạy

```bash
node fshare-web-server.mjs
```

Mở trình duyệt tại:

- `http://127.0.0.1:4312`

## Cách dùng

- `Fetch mới danh sách app`: quét lại toàn bộ folder Fshare và ghi đè cache local
- `Search`: tìm theo tên app trực tiếp từ file cache local đã lưu

## Files chính

- `fshare-web-server.mjs`: local HTTP server
- `fshare-search.mjs`: logic fetch Fshare và search cache
- `fshare-web.html`
- `fshare-web.css`
- `fshare-web.js`
- `fshare-items-XJNDMQJ8AEUU.json`: cache local hiện tại
