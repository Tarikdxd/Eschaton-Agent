export type TodoStatus = 'pending' | 'in_progress' | 'done'

export interface Todo {
  text: string
  status: TodoStatus
}

export const TODO_TOOL = {
  type: 'function' as const,
  function: {
    name: 'todo_write',
    description:
      'Create or update the task list for multi-step work. Call it at the start of a complex task and after finishing each step.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
            },
            required: ['text', 'status'],
          },
        },
      },
      required: ['todos'],
    },
  },
}

export function normalizeTodos(raw: any): Todo[] {
  if (!Array.isArray(raw)) return []

  return raw
    .filter((item) => item && typeof item.text === 'string')
    .map((item) => ({
      text: String(item.text).slice(0, 200),
      status: item.status === 'done' || item.status === 'in_progress' ? item.status : 'pending',
    }))
}

export function formatTodo(todo: Todo): string {
  const box = todo.status === 'done' ? '[x]' : todo.status === 'in_progress' ? '[~]' : '[ ]'
  return `${box} ${todo.text}`
}
