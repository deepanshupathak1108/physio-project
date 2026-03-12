
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// ===== STATIC FOLDER =====
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve the frontend statically with an absolute path
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ===== DB CONNECT =====
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/physio';
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ MongoDB Connected successfully");
}).catch(err => {
  console.error("❌ MongoDB Connection Error:", err.message);
  // We don't exit the process here so that Render still binds to the PORT
});

// ===== MODELS =====
const Patient = mongoose.model('Patient', {
  name: String,
  age: Number,
  phone: String,
  medical_history: String
});

const Payment = mongoose.model('Payment', {
  patient_id: String,
  amount: Number,
  date: String
});

const Treatment = mongoose.model('Treatment', {
  patient_id: String,
  treatment: String,
  date: String,
  notes: String
});

const Image = mongoose.model('Image', {
  patient_id: String,
  image_url: String,
  type: String,
  date: String
});

// ===== MULTER =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// ===== ROUTES =====

// ADD PATIENT
app.post('/add-patient', async (req, res) => {
  let { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).send({ message: "Name & Phone required" });
  }

  name = name.trim().toLowerCase();
  phone = phone.trim();

  const existing = await Patient.findOne({ name, phone });

  if (existing) {
    return res.status(400).send({ message: "Patient already exists" });
  }

  const p = new Patient({ ...req.body, name, phone });
  await p.save();

  res.send(p);
});

// GET PATIENTS
app.get('/patients', async (req, res) => {
  res.send(await Patient.find());
});

// DELETE PATIENT
app.delete('/delete-patient/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await Patient.findByIdAndDelete(id);
    await Payment.deleteMany({ patient_id: id });
    await Treatment.deleteMany({ patient_id: id });
    await Image.deleteMany({ patient_id: id });
    res.send({ message: "Deleted successfully" });
  } catch (e) {
    res.status(500).send({ message: "Error deleting patient" });
  }
});

// ADD PAYMENT
app.post('/add-payment', async (req, res) => {
  const pay = new Payment(req.body);
  await pay.save();
  res.send(pay);
});

// ADD TREATMENT
app.post('/add-treatment', async (req, res) => {
  const t = new Treatment(req.body);
  await t.save();
  res.send(t);
});

// GET FULL PATIENT DATA
app.get('/patient/:id', async (req, res) => {
  const id = req.params.id;

  res.send({
    patient: await Patient.findById(id),
    payments: await Payment.find({ patient_id: id }),
    treatments: await Treatment.find({ patient_id: id }),
    images: await Image.find({ patient_id: id })
  });
});

// TOTAL PAYMENT
app.get('/total-payment', async (req, res) => {
  const payments = await Payment.find();
  const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  res.send({ total });
});

// IMAGE UPLOAD
app.post('/upload/:patientId', upload.single('image'), async (req, res) => {
  const newImage = new Image({
    patient_id: req.params.patientId,
    image_url: req.file.filename,
    type: req.body.type || "general",
    date: new Date().toLocaleDateString()
  });

  await newImage.save();

  res.send({ message: "Image uploaded", file: req.file.filename });
});

// MONTHLY PAYMENT
app.get('/monthly-payment/:type', async (req, res) => {
  const type = req.params.type;
  const now = new Date();

  let startDate, endDate;

  if (type === "this") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  else if (type === "prev") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  else {
    startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const allPayments = await Payment.find();

  const payments = allPayments.filter(p => {
    if (!p.date) return false;
    const datePart = p.date.split(' - ')[0];

    let d;
    if (datePart.includes('/')) {
      const parts = datePart.split('/');
      if (parts.length === 3) {
        d = new Date(parts[2], parts[1] - 1, parts[0]);
      } else {
        d = new Date(datePart);
      }
    } else {
      d = new Date(datePart);
    }

    if (isNaN(d)) return false;
    return d >= startDate && d < endDate;
  });

  const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  res.send({ total, count: payments.length });
});

// RESET ALL REVENUE (Testing)
app.delete('/reset-revenue', async (req, res) => {
  try {
    await Payment.deleteMany({});
    res.send({ message: "All revenue reset" });
  } catch (e) {
    res.status(500).send({ message: "Failed to reset" });
  }
});

// Catch-all route to serve the frontend index.html for any remaining undefined GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ===== START =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`🔥 Server running on port ${PORT} (Bound to 0.0.0.0)`));