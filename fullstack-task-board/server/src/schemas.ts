import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const statusSchema = z.enum(TASK_STATUSES, {
  error: `Status must be one of: ${TASK_STATUSES.join(', ')}`,
});

export const idSchema = z.coerce
  .number({ error: 'Id must be a number' })
  .int('Id must be an integer')
  .positive('Id must be positive');

const nameField = z
  .string({ error: 'Name is required' })
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be at most 100 characters');

const titleField = z
  .string({ error: 'Title is required' })
  .trim()
  .min(1, 'Title is required')
  .max(200, 'Title must be at most 200 characters');

const descriptionField = z
  .string({ error: 'Description must be a string' })
  .trim()
  .max(2000, 'Description must be at most 2000 characters');

/** Empty / whitespace-only assignee is normalised to null (unassigned). */
const assigneeField = z
  .string({ error: 'Assignee must be a string' })
  .trim()
  .max(100, 'Assignee must be at most 100 characters')
  .nullable()
  .transform((value) => (value ? value : null));

export const createBoardSchema = z.strictObject({ name: nameField });
export const updateBoardSchema = createBoardSchema;

export const createTaskSchema = z.strictObject({
  title: titleField,
  description: descriptionField.default(''),
  assignee: assigneeField.default(null),
  status: statusSchema.default('todo'),
});

export const updateTaskSchema = z
  .strictObject({
    title: titleField.optional(),
    description: descriptionField.optional(),
    assignee: assigneeField.optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field must be provided',
  });

export const moveTaskSchema = z.strictObject({
  status: statusSchema,
  position: z.number().int('Position must be an integer').min(0, 'Position must be >= 0').optional(),
});

export const taskFilterSchema = z.object({
  assignee: z.string().trim().min(1).max(100).optional(),
  status: statusSchema.optional(),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type TaskFilter = z.infer<typeof taskFilterSchema>;
