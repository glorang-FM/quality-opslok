require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/parts',         require('./routes/parts'));
app.use('/api/control-plans', require('./routes/control-plans'));
app.use('/api/documents',     require('./routes/documents'));
app.use('/api/inspections',   require('./routes/inspections'));
app.use('/api/ncrs',          require('./routes/ncrs'));
app.use('/api/capas',         require('./routes/capas'));
app.use('/api/suppliers',     require('./routes/suppliers'));
app.use('/api/gauges',        require('./routes/gauges'));

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Quality OpsLok running on http://localhost:${PORT}`));
