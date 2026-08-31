import express from 'express';
import { prisma } from './prisma';

const app = express();

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'TokTickIT API',
    });
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            where: { isActive: true },
            orderBy: { id: 'asc' },
            select: { id: true, name: true },
        });
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Unable to retrieve categories' });
    }
});

app.get('/api/requesters', async (req, res) => {
    try {
        const requesters = await prisma.requester.findMany({
            where: { isActive: true },
            orderBy: { id: 'asc' },
            select: { id: true, name: true },
        });
        res.status(200).json(requesters);
    } catch (error) {
        res.status(500).json({ error: 'Unable to retrieve requesters' });
    }
});

export default app;