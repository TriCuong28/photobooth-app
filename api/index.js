const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Temporary storage directory for Vercel Serverless / Local Environment
const UPLOADS_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
const METADATA_FILE = path.join(UPLOADS_DIR, 'photos.json');

if (!fs.existsSync(UPLOADS_DIR)) {
    try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
}

// In-Memory Database for Vercel Serverless Function lifecycle
let inMemoryPhotos = [];

function getPhotosMetadata() {
    try {
        if (fs.existsSync(METADATA_FILE)) {
            const data = fs.readFileSync(METADATA_FILE, 'utf8');
            const filePhotos = JSON.parse(data || '[]');
            if (filePhotos.length > 0) return filePhotos;
        }
    } catch (err) {}
    return inMemoryPhotos;
}

function savePhotosMetadata(photos) {
    inMemoryPhotos = photos;
    try {
        if (!fs.existsSync(UPLOADS_DIR)) {
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        }
        fs.writeFileSync(METADATA_FILE, JSON.stringify(photos, null, 2), 'utf8');
    } catch (err) {}
}

// Serve Image/GIF Files with Base64 Fallback for Serverless Persistence
app.get('/uploads/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(UPLOADS_DIR, filename);

    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }

    const photoId = filename.replace(/\.(png|gif)$/, '');
    const photos = getPhotosMetadata();
    const photo = photos.find(p => p.id === photoId || p.fileName === filename || p.gifFileName === filename);

    if (photo) {
        if (filename.endsWith('.gif') && photo.gifData) {
            const base64Data = photo.gifData.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            res.setHeader('Content-Type', 'image/gif');
            return res.send(imgBuffer);
        } else if (photo.imageData) {
            const base64Data = photo.imageData.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            res.setHeader('Content-Type', 'image/png');
            return res.send(imgBuffer);
        }
    }

    return res.status(404).send('Không tìm thấy hình ảnh');
});

// API Info
app.get('/api/info', (req, res) => {
    const host = req.get('host');
    res.json({
        status: 'online',
        host: host,
        baseUrl: `${req.protocol}://${host}`,
        environment: process.env.VERCEL ? 'vercel' : 'local'
    });
});

// Upload Canvas Image & GIF
app.post('/api/upload', (req, res) => {
    try {
        const { image, gifImage, layoutType = 'strip', frameTitle = 'K-PHOTOBOOTH' } = req.body;

        if (!image) {
            return res.status(400).json({ success: false, error: 'Thiếu dữ liệu hình ảnh (Base64 required)' });
        }

        const timestamp = Date.now();
        const randomHash = Math.random().toString(36).substring(2, 8);
        const photoId = `photo_${timestamp}_${randomHash}`;
        const fileName = `${photoId}.png`;
        const filePath = path.join(UPLOADS_DIR, fileName);

        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        try { fs.writeFileSync(filePath, imageBuffer); } catch (e) {}

        let gifFileName = null;
        let gifUrl = null;
        let gifLocalPath = null;

        if (gifImage) {
            try {
                const gifBase64Data = gifImage.replace(/^data:image\/\w+;base64,/, '');
                const gifBuffer = Buffer.from(gifBase64Data, 'base64');
                gifFileName = `${photoId}.gif`;
                const gifFilePath = path.join(UPLOADS_DIR, gifFileName);
                fs.writeFileSync(gifFilePath, gifBuffer);
                gifLocalPath = `/uploads/${gifFileName}`;
            } catch (err) {}
        }

        const requestHost = req.get('host');
        const protocol = req.protocol || 'https';
        const shareUrl = `${protocol}://${requestHost}/view.html?id=${photoId}`;
        const imageUrl = `${protocol}://${requestHost}/uploads/${fileName}`;
        if (gifFileName) {
            gifUrl = `${protocol}://${requestHost}/uploads/${gifFileName}`;
        }

        const newPhoto = {
            id: photoId,
            fileName: fileName,
            gifFileName: gifFileName,
            imageUrl: imageUrl,
            gifUrl: gifUrl,
            imageData: image,
            gifData: gifImage || null,
            localPath: `/uploads/${fileName}`,
            gifLocalPath: gifLocalPath,
            shareUrl: shareUrl,
            layoutType: layoutType,
            frameTitle: frameTitle,
            createdAt: new Date().toISOString(),
            sizeBytes: imageBuffer.length
        };

        const photos = getPhotosMetadata();
        photos.unshift(newPhoto);
        savePhotosMetadata(photos);

        return res.json({
            success: true,
            id: photoId,
            imageUrl: imageUrl,
            gifUrl: gifUrl,
            localPath: `/uploads/${fileName}`,
            gifLocalPath: gifLocalPath,
            shareUrl: shareUrl,
            createdAt: newPhoto.createdAt
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Lỗi server: ' + error.message });
    }
});

// Get all photos
app.get('/api/photos', (req, res) => {
    const photos = getPhotosMetadata();
    res.json({
        success: true,
        count: photos.length,
        photos: photos.map(p => ({
            id: p.id,
            fileName: p.fileName,
            imageUrl: p.imageUrl,
            gifUrl: p.gifUrl,
            localPath: p.localPath,
            shareUrl: p.shareUrl,
            layoutType: p.layoutType,
            frameTitle: p.frameTitle,
            createdAt: p.createdAt,
            sizeBytes: p.sizeBytes
        }))
    });
});

// Get photo details by ID
app.get('/api/photos/:id', (req, res) => {
    const { id } = req.params;
    const photos = getPhotosMetadata();
    const photo = photos.find(p => p.id === id);

    if (photo) {
        return res.json({ success: true, photo: photo });
    }

    return res.status(404).json({ success: false, error: 'Không tìm thấy ảnh' });
});

// Delete photo
app.delete('/api/photos/:id', (req, res) => {
    const { id } = req.params;
    let photos = getPhotosMetadata();
    const photoIndex = photos.findIndex(p => p.id === id);

    if (photoIndex !== -1) {
        photos.splice(photoIndex, 1);
        savePhotosMetadata(photos);
        return res.json({ success: true, message: 'Đã xóa ảnh thành công' });
    }

    return res.status(404).json({ success: false, error: 'Không tìm thấy ảnh' });
});

// Batch delete
app.post('/api/photos/delete-batch', (req, res) => {
    try {
        const { ids, all } = req.body;
        let photos = getPhotosMetadata();

        if (all) {
            savePhotosMetadata([]);
            return res.json({ success: true, message: 'Đã xóa tất cả ảnh thành công' });
        }

        if (Array.isArray(ids)) {
            const idSet = new Set(ids);
            photos = photos.filter(p => !idSet.has(p.id));
            savePhotosMetadata(photos);
            return res.json({ success: true, message: `Đã xóa ${ids.length} ảnh` });
        }

        return res.status(400).json({ success: false, error: 'Thiếu dữ liệu xóa' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = app;
