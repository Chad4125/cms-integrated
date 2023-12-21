const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cron = require('node-cron');

const app = express();
const port = 12561;

const moment = require('moment-timezone');

// MongoDB Connections
mongoose.connect('mongodb://0.0.0.0:27017/messageLog', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const renderJobConnection = mongoose.createConnection('mongodb://0.0.0.0:27017/renderJobManager', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Use a separate connection for Image model
const imageConnection = mongoose.createConnection('mongodb://0.0.0.0:27017/uploadedImageObj', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const WeatherData = mongoose.model('WeatherData', {
  responsedata: String,
  timestamp: { type: Date, default: Date.now },
});

const messageSchema = new mongoose.Schema({
  text: String,
  timestamp: { type: Date, default: Date.now }
});

const renderJobSchema = new mongoose.Schema({
  submitter: String,
  status: String,
});

const imageSchema = new mongoose.Schema({
  version: String,
  filename: String
});

const Message = mongoose.model('Message', messageSchema);
const RenderJob = renderJobConnection.model('RenderJob', renderJobSchema);
const Image = imageConnection.model('Image', imageSchema);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

const getCurrentTimeInKorea = () => {
  return moment.tz('Asia/Seoul').subtract(1, 'hours').format('YYYYMMDD HHmm');
};

const apiKey = 'YOUR_OPENWEATHERMAP_API_KEY';
const city = 'YOUR_CITY_NAME';

const fetchWeatherData = async () => {
  try {
    const currentTimeInKorea = getCurrentTimeInKorea();
    const base_date = currentTimeInKorea.substring(0, 8);
    const base_time = currentTimeInKorea.substring(9);
    const apiUrl = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=WLm8yF801DZP%2FnyNRjzZxFL1FugM0JS%2FJxo35T927rUJTTkWqV57Q2UjLQGgKPHsRG6VsKJlxEGJQBSwKNggbg%3D%3D&pageNo=1&numOfRows=1000&dataType=XML&base_date=${base_date}&base_time=${base_time}&nx=92&ny=132`;
    const response = await axios.get(apiUrl);
    const weatherData = new WeatherData({ responsedata: response.data });
    await weatherData.save();
    console.log('Weather data fetched and saved:', weatherData);
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
  }
};

// Endpoint to get the latest saved weather data
app.get('/latest-weather-data', async (req, res) => {
    try {
      const latestWeatherData = await WeatherData.findOne().sort({ timestamp: -1 });
      
      if (latestWeatherData) {
        res.json(latestWeatherData);
      } else {
        res.status(404).send('No weather data found');
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
    }
  });
  

cron.schedule('*/10 * * * *', fetchWeatherData);
//cron.schedule('* * * * * *', fetchWeatherData);

app.post('/save-image', async (req, res) => {
  try {
    const version = req.body.version;
    const filename = req.body.filename;
    const newImage = new Image({ version, filename });
    await newImage.save();
    res.status(201).json({ message: 'Image information saved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/log', async (req, res) => {
  const { text } = req.body;
  try {
    const message = new Message({ text });
    await message.save();
    res.status(201).send('Message saved successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/latest', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 1;
    const latestMessages = await Message.find().sort({ timestamp: -1 }).limit(count);
    if (latestMessages.length > 0) {
      const messages = latestMessages.map(message => ({ text: message.text }));
      res.json({ messages });
    } else {
      res.status(404).send('No messages found');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/submitJob', async (req, res) => {
  try {
    const { submitter } = req.body;
    const newJob = new RenderJob({ submitter, status: 'Pending' });
    await newJob.save();
    res.status(201).json({ message: 'Job submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/viewStatus/:submitter', async (req, res) => {
  try {
    const submitter = req.params.submitter;
    const jobs = await RenderJob.find({ submitter });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/takeJob', async (req, res) => {
  try {
    const job = await RenderJob.findOneAndUpdate(
      { status: 'Pending' },
      { $set: { status: 'In Progress' } },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ message: 'No jobs available' });
    }

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/updateStatus/:jobId', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const { status } = req.body;
    const updatedJob = await RenderJob.findByIdAndUpdate(
      jobId,
      { $set: { status } },
      { new: true }
    );

    if (!updatedJob) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json(updatedJob);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
