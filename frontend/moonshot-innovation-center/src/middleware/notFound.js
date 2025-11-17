const notFound = (req, res) => {
    res.status(404).json({ error: `Route ${req.originalUrl} not found` });
};

module.exports = { notFound };