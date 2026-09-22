const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Supabase Environment Setup
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('[SUPABASE SUCCESS] Connected to Supabase Database & Storage!');
    } catch (e) {
        console.error('[SUPABASE ERROR] Failed to initialize Supabase client:', e);
    }
}

// Local Temporary Storage Setup
const UPLOADS_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
const METADATA_FILE = path.join(UPLOADS_DIR, 'photos.json');

if (!fs.existsSync(UPLOADS_DIR)) {
    try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
}

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

// Serve Images Statically
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

// API Info & Connection Health Status
app.get('/api/info', (req, res) => {
    const host = req.get('host');
    res.json({
        status: 'online',
        host: host,
        baseUrl: `${req.protocol}://${host}`,
        supabaseConnected: !!supabase,
        environment: process.env.VERCEL ? 'vercel' : 'local'
    });
});

// Upload Photo (Supabase + Local Backup)
app.post('/api/upload', async (req, res) => {
    try {
        const { image, gifImage, layoutType = 'strip', frameTitle = 'K-PHOTOBOOTH', deviceSessionId = 'default_device' } = req.body;

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
        let gifBuffer = null;

        if (gifImage) {
            try {
                const gifBase64Data = gifImage.replace(/^data:image\/\w+;base64,/, '');
                gifBuffer = Buffer.from(gifBase64Data, 'base64');
                gifFileName = `${photoId}.gif`;
                const gifFilePath = path.join(UPLOADS_DIR, gifFileName);
                fs.writeFileSync(gifFilePath, gifBuffer);
                gifLocalPath = `/uploads/${gifFileName}`;
            } catch (err) {}
        }

        const requestHost = req.get('host');
        const protocol = req.protocol || 'https';
        let shareUrl = `${protocol}://${requestHost}/view.html?id=${photoId}`;
        let imageUrl = `${protocol}://${requestHost}/uploads/${fileName}`;
        if (gifFileName) {
            gifUrl = `${protocol}://${requestHost}/uploads/${gifFileName}`;
        }

        // Upload to Supabase Storage & Database if configured
        if (supabase) {
            try {
                // 1. Upload PNG to Supabase Storage
                const { error: pngErr } = await supabase.storage
                    .from('photobooth-photos')
                    .upload(`${fileName}`, imageBuffer, { contentType: 'image/png', upsert: true });

                if (!pngErr) {
                    const { data: publicUrlData } = supabase.storage.from('photobooth-photos').getPublicUrl(`${fileName}`);
                    if (publicUrlData && publicUrlData.publicUrl) {
                        imageUrl = publicUrlData.publicUrl;
                    }
                }

                // 2. Upload GIF to Supabase Storage
                if (gifBuffer && gifFileName) {
                    const { error: gifErr } = await supabase.storage
                        .from('photobooth-photos')
                        .upload(`${gifFileName}`, gifBuffer, { contentType: 'image/gif', upsert: true });

                    if (!gifErr) {
                        const { data: gifPublicData } = supabase.storage.from('photobooth-photos').getPublicUrl(`${gifFileName}`);
                        if (gifPublicData && gifPublicData.publicUrl) {
                            gifUrl = gifPublicData.publicUrl;
                        }
                    }
                }

                // 3. Insert metadata record to Supabase Database table 'photos'
                await supabase.from('photos').insert([{
                    id: photoId,
                    device_session_id: deviceSessionId,
                    image_url: imageUrl,
                    gif_url: gifUrl,
                    layout_type: layoutType,
                    frame_title: frameTitle,
                    size_bytes: imageBuffer.length
                }]);

                console.log(`[SUPABASE SUCCESS] Uploaded photo ${photoId} to Supabase Cloud!`);
            } catch (err) {
                console.error('[SUPABASE UPLOAD WARNING] Fallback to local storage:', err);
            }
        }

        const newPhoto = {
            id: photoId,
            deviceSessionId: deviceSessionId,
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

// Get User's Isolated Device Photos (Filter by deviceSessionId)
app.get('/api/photos', async (req, res) => {
    const { sessionId } = req.query;

    if (supabase && sessionId) {
        try {
            const { data: dbPhotos, error: fetchErr } = await supabase
                .from('photos')
                .select('*')
                .eq('device_session_id', sessionId)
                .order('created_at', { ascending: false });

            if (!fetchErr && dbPhotos) {
                return res.json({
                    success: true,
                    count: dbPhotos.length,
                    photos: dbPhotos.map(p => ({
                        id: p.id,
                        fileName: `${p.id}.png`,
                        imageUrl: p.image_url,
                        gifUrl: p.gif_url,
                        localPath: p.image_url,
                        shareUrl: `${req.protocol}://${req.get('host')}/view.html?id=${p.id}`,
                        layoutType: p.layout_type,
                        frameTitle: p.frame_title,
                        createdAt: p.created_at
                    }))
                });
            }
        } catch (err) {}
    }

    // Local / Memory Fallback filtering by deviceSessionId
    const photos = getPhotosMetadata();
    const filteredPhotos = sessionId ? photos.filter(p => p.deviceSessionId === sessionId || !p.deviceSessionId) : photos;

    res.json({
        success: true,
        count: filteredPhotos.length,
        photos: filteredPhotos.map(p => ({
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

// Get Single Photo Details by ID
app.get('/api/photos/:id', async (req, res) => {
    const { id } = req.params;

    if (supabase) {
        try {
            const { data: dbPhoto, error } = await supabase
                .from('photos')
                .select('*')
                .eq('id', id)
                .single();

            if (!error && dbPhoto) {
                return res.json({
                    success: true,
                    photo: {
                        id: dbPhoto.id,
                        fileName: `${dbPhoto.id}.png`,
                        imageUrl: dbPhoto.image_url,
                        gifUrl: dbPhoto.gif_url,
                        localPath: dbPhoto.image_url,
                        gifLocalPath: dbPhoto.gif_url,
                        shareUrl: `${req.protocol}://${req.get('host')}/view.html?id=${dbPhoto.id}`,
                        createdAt: dbPhoto.created_at
                    }
                });
            }
        } catch (e) {}
    }

    const photos = getPhotosMetadata();
    const photo = photos.find(p => p.id === id);

    if (photo) {
        return res.json({ success: true, photo: photo });
    }

    return res.status(404).json({ success: false, error: 'Không tìm thấy ảnh' });
});

// Delete Single Photo (Supabase + Local)
app.delete('/api/photos/:id', async (req, res) => {
    const { id } = req.params;

    if (supabase) {
        try {
            await supabase.from('photos').delete().eq('id', id);
            await supabase.storage.from('photobooth-photos').remove([`${id}.png`, `${id}.gif`]);
        } catch (e) {}
    }

    let photos = getPhotosMetadata();
    const photoIndex = photos.findIndex(p => p.id === id);

    if (photoIndex !== -1) {
        photos.splice(photoIndex, 1);
        savePhotosMetadata(photos);
        return res.json({ success: true, message: 'Đã xóa ảnh thành công' });
    }

    return res.json({ success: true, message: 'Đã xóa ảnh' });
});

// Delete Photos Batch
app.post('/api/photos/delete-batch', async (req, res) => {
    try {
        const { ids, all, sessionId } = req.body;

        if (supabase) {
            try {
                if (all && sessionId) {
                    await supabase.from('photos').delete().eq('device_session_id', sessionId);
                } else if (Array.isArray(ids) && ids.length > 0) {
                    await supabase.from('photos').delete().in('id', ids);
                    const filesToRemove = [];
                    ids.forEach(i => { filesToRemove.push(`${i}.png`, `${i}.gif`); });
                    await supabase.storage.from('photobooth-photos').remove(filesToRemove);
                }
            } catch (e) {}
        }

        let photos = getPhotosMetadata();

        if (all) {
            if (sessionId) {
                photos = photos.filter(p => p.deviceSessionId !== sessionId);
            } else {
                photos = [];
            }
            savePhotosMetadata(photos);
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
