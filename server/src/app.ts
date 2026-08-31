import express from 'express';
import { prisma } from './prisma';

const app = express();
app.use(express.json());

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
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve categories' } });
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
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve requesters' } });
    }
});

app.get('/api/related-systems', async (req, res) => {
    try {
        const relatedSystems = await prisma.relatedSystem.findMany({
            where: { isActive: true },
            orderBy: { id: 'asc' },
            select: { id: true, name: true },
        });
        res.status(200).json(relatedSystems);
    } catch (error) {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve related systems' } });
    }
});

const REQUESTED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

app.post('/api/tickets', async (req, res) => {
  try {
    const { requesterId, categoryId, relatedSystemId, summary, description, requestedPriority } = req.body;

    if (typeof requesterId !== 'number') {
        return res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'requesterId is required',
                fields: [{ field: 'requesterId', message: 'requesterId is required' }],
            },
        });
    }

    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
        return res.status(404).json({
            error: { code: 'REQUESTER_NOT_FOUND', message: 'Requester not found or inactive' },
        });
    }

    const fields: { field: string; message: string }[] = [];

    if (typeof categoryId !== 'number') {
        fields.push({ field: 'categoryId', message: 'categoryId is required' });
    } else {
        const category = await prisma.category.findUnique({ where: { id: categoryId } });
        if (!category || !category.isActive) {
            fields.push({ field: 'categoryId', message: 'categoryId must reference an active category' });
        }
    }

    if (typeof relatedSystemId !== 'number') {
        fields.push({ field: 'relatedSystemId', message: 'relatedSystemId is required' });
    } else {
        const relatedSystem = await prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } });
        if (!relatedSystem || !relatedSystem.isActive) {
            fields.push({ field: 'relatedSystemId', message: 'relatedSystemId must reference an active related system' });
        }
    }

    const trimmedSummary = typeof summary === 'string' ? summary.trim() : '';
    if (trimmedSummary.length < 5 || trimmedSummary.length > 120) {
        fields.push({ field: 'summary', message: 'summary must be 5-120 characters' });
    }

    const trimmedDescription = typeof description === 'string' ? description.trim() : '';
    if (trimmedDescription.length < 10 || trimmedDescription.length > 2000) {
        fields.push({ field: 'description', message: 'description must be 10-2000 characters' });
    }

    if (!REQUESTED_PRIORITIES.includes(requestedPriority)) {
        fields.push({ field: 'requestedPriority', message: 'requestedPriority must be LOW, MEDIUM, or HIGH' });
    }

    if (fields.length > 0) {
        return res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'One or more fields are invalid', fields },
        });
    }

    const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('ticket_number_seq') AS nextval`;
    const ticketNumber = `TKT-${new Date().getFullYear()}-${String(nextval).padStart(6, '0')}`;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: trimmedSummary,
        description: trimmedDescription,
        requestedPriority,
      },
      select: {
        id: true,
        ticketNumber: true,
        ticketDate: true,
        requesterId: true,
        categoryId: true,
        relatedSystemId: true,
        summary: true,
        description: true,
        requestedPriority: true,
        currentStatus: true,
      },
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('POST /api/tickets failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to create ticket' } });
  }
});

export default app;