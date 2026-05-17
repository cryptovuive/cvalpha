# 🐦 Twitter Auto Reply Extension

Extension Chrome tự động reply comment trên Twitter/X bằng AI (OpenAI GPT-5.4-mini).

## ✨ Tính năng

- **📌 Side Panel** — Pin bên phải Chrome, luôn tiện truy cập
- **🤖 AI-Powered Replies** — Sử dụng GPT-5.4-mini tạo reply tự nhiên
- **🎨 5 giọng điệu** — Thân thiện, Chuyên nghiệp, Hài hước, Mỉa mai, Tùy chỉnh
- **🌍 Đa ngôn ngữ** — Việt, Anh, Nhật, Hàn, Trung
- **📋 Nhật ký hoạt động** — Theo dõi real-time trong side panel
- **⚡ Queue system** — Xử lý reply tuần tự, tránh spam
- **🛡️ Rate limiting** — Giới hạn reply/giờ, reply/ngày
- **🚫 Blacklist** — Bỏ qua comment chứa từ khóa
- **🧪 Preview** — Test reply trước khi dùng thật

## 📦 Cài đặt

### 1. Load vào Chrome

1. Mở `chrome://extensions/`
2. Bật **Developer mode** (góc phải trên)
3. Click **Load unpacked**
4. Chọn thư mục `twitter-auto-reply-extension`

### 2. Mở Side Panel

- Click icon extension trên toolbar → Side Panel tự mở ra bên phải
- Hoặc: Right-click icon → "Open side panel"

### 3. Cấu hình

1. Tab **Cài đặt** → nhập **OpenAI API Key**
2. Chọn model: `gpt-5.4-mini` (mặc định)
3. Click **🧪 Kiểm tra kết nối API**
4. Bật toggle **ON** ở header

## 🚀 Sử dụng

### Bật/Tắt nhanh
- Click icon extension → Toggle switch ON/OFF
- Hoặc click badge "AutoReply" góc phải dưới trên Twitter

### Side Panel Tabs

| Tab | Chức năng |
|-----|-----------|
| 💬 **Tạo chat tự động** | Stats, nhật ký hoạt động, quét nhanh |
| ✏️ **Tùy chỉnh Prompt** | Giọng điệu, ngôn ngữ, preview reply |
| ⚙️ **Cài đặt** | API key, model, rate limit, bộ lọc |

### Hoạt động
1. Extension quét comment mới trên Twitter (Observer + periodic 10s)
2. Khi phát hiện comment → gửi cho AI tạo reply
3. AI reply phù hợp ngữ cảnh → tự động đăng
4. Nhật ký real-time trong side panel

### Badge trạng thái (trên Twitter)
- 🟢 **AutoReply ON** — Đang hoạt động
- ⚪ **AutoReply OFF** — Tắt

## ⚙️ Cài đặt chi tiết

### Cơ bản
| Cài đặt | Mô tả | Mặc định |
|---------|-------|----------|
| Model | OpenAI model | `gpt-5.4-mini` |
| Ngôn ngữ | Ngôn ngữ reply | Tiếng Việt |
| Giọng điệu | Phong cách reply | Thân thiện |

### Rate Limiting
| Cài đặt | Mô tả | Mặc định |
|---------|-------|----------|
| Giới hạn/giờ | Max reply mỗi giờ | 10 |
| Delay | Giữa các reply (giây) | 30 |

### Nâng cao
| Cài đặt | Mô tả |
|---------|-------|
| Blacklist | Từ khóa bỏ qua (phẩy ngăn cách) |
| Bỏ qua đã reply | Không reply lại comment cũ |
| Bỏ qua tweet mình | Không reply tweet của bạn |
| Custom Model | Tên model tùy chỉnh |
| Base URL | API endpoint (cho proxy) |

## 🔑 API

Extension sử dụng OpenAI Chat Completions API:

```
POST https://api.openai.com/v1/chat/completions
Authorization: Bearer sk-...

{
  "model": "gpt-5.4-mini",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "max_tokens": 150,
  "temperature": 0.7
}
```

### Compatible APIs
Extension hoạt động với bất kỳ API nào compatible OpenAI:
- OpenAI
- Azure OpenAI
- OpenRouter
- Local LLM (Ollama, LM Studio, v.v.)

Thay đổi **Base URL** trong Options → API Configuration.

## 🛡️ Lưu ý an toàn

- ⚠️ **API Key** được lưu local trong browser, không upload đâu
- ⚠️ Twitter có thể **khóa tài khoản** nếu spam quá nhiều
- ⚠️ Nên bắt đầu với **giới hạn thấp** (5 reply/giờ) rồi tăng dần
- ⚠️ Kiểm tra reply trước khi dùng production

## 🐛 Debug

1. Mở DevTools (F12) trên Twitter
2. Tab Console → filter `[AutoReply]`
3. Xem log quét và reply

## 📝 Export/Import Config

Vào **Options** → **Dữ liệu**:
- **Export** — Lưu config ra file JSON
- **Import** — Load config từ file
- **Reset** — Xóa tất cả

## License

MIT
