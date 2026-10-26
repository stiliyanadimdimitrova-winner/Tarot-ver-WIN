'use strict';
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { seedIfEmpty } = require('./seed');
const { createPublicApp } = require('./publicApp');

const PORT = Number(process.env.PORT || 3000);

seedIfEmpty()
  .then(() => createPublicApp().listen(PORT, () => console.log(`Site: http://localhost:${PORT}`)))
  .catch((e) => { console.error(e); process.exit(1); });
