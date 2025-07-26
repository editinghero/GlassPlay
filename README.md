# GlassPlay 🎬

A modern video player with stunning glassmorphism effects, built with Electron, React, and FFmpeg.

![GlassPlay](https://img.shields.io/badge/GlassPlay-Video%20Player-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey?style=for-the-badge)

## ✨ Features

- **Modern UI**: Beautiful glassmorphism design with smooth animations
- **Video Processing**: Automatic ambient video generation using FFmpeg
- **Multi-format Support**: Supports MP4, WebM, OGG, MOV, AVI, MKV
- **Hardware Acceleration**: Utilizes GPU encoding when available (AMD, NVIDIA, Intel)
- **Audio & Subtitle Tracks**: Full support for multiple audio and subtitle tracks
- **Cross-platform**: Available for Windows, macOS, and Linux

## 📖 User Manual

Read the full step-by-step guide in the offline file [`docs/manual.html`](docs/manual.html). When running the app, you can also click the little 📖 icon in the bottom-left corner of the landing page to open it.


## 📋 System Requirements

- **Windows**: Windows 10/11 (x64)
- **macOS**: macOS 10.14+ (x64/ARM64)
- **Linux**: Ubuntu 18.04+ or equivalent (x64)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 500MB for installation

## 🚀 Quick Start

Download the app from [Releases](https://github.com/editinghero/GlassPlay/releases)

Website - https://glassplay.pages.dev (FFmpeg not supported)



Or Build It By Your Own
---------------------------------------------

## 🔧 Technical Stack

- **Frontend**: React 19, TypeScript, Vite
- **Desktop**: Electron 30
- **Styling**: CSS with Glassmorphism effects, Framer Motion
- **Video Processing**: FFmpeg with hardware acceleration
- **Icons**: Heroicons, React Icons
- **Build**: electron-builder with optimizations

## 🛠️ Development Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | Build for production with cleanup |
| `npm run build:prod` | Production build with optimizations |
| `npm run cleanup` | Clean temporary and build files |
| `npm run electron:dev` | Start Electron in development mode |
| `npm run electron:build` | Build Electron app for all platforms |
| `npm run electron:build:win` | Build for Windows only |

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👨‍💻 Developer

Developed with ❤️ by [EditingHero](https://github.com/editinghero)

---

**Note**: This software includes FFmpeg which is licensed under LGPL v2.1. The FFmpeg binary is distributed separately and is not modified by this software.
