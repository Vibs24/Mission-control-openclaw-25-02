export function createInternalContextProvider({ q, api }) {
  return {
    name: "internal",
    async getTaskBundle(taskId) {
      const [task, messages, documents, activities, runs] = await Promise.all([
        q(api.tasks.get, { id: taskId }),
        q(api.messages.listByTask, { taskId }),
        q(api.documents.list, { taskId }),
        q((api).activities.listByTask, { taskId, limit: 120 }),
        q((api).automation.listAutomationRunsByTask, { taskId }),
      ]);
      return {
        task,
        messages: messages || [],
        documents: documents || [],
        activities: activities || [],
        automationRuns: runs || [],
      };
    },
  };
}

