// Social Media Router Registration
// Wird vom anderen Agent in index.js eingebunden
// Falls nicht, manuell: app.use('/api/social', require('./routes/social'));

module.exports = (app) => {
  app.use('/api/social', require('./routes/social'));
};