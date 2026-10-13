import { ipcRenderer } from 'electron'
import type { MicrosoftTodoApi } from './microsoft-todo-api'

export const microsoftTodoApi: MicrosoftTodoApi = {
  status: () => ipcRenderer.invoke('todo:status'),
  setClientId: (args) => ipcRenderer.invoke('todo:setClientId', args),
  signIn: () => ipcRenderer.invoke('todo:signIn'),
  signOut: () => ipcRenderer.invoke('todo:signOut'),
  fetchLists: () => ipcRenderer.invoke('todo:fetchLists'),
  fetchTasks: (args) => ipcRenderer.invoke('todo:fetchTasks', args),
  fetchChecklist: (args) => ipcRenderer.invoke('todo:fetchChecklist', args),
  createTask: (args) => ipcRenderer.invoke('todo:createTask', args),
  setTaskCompleted: (args) => ipcRenderer.invoke('todo:setTaskCompleted', args),
  updateTask: (args) => ipcRenderer.invoke('todo:updateTask', args),
  deleteTask: (args) => ipcRenderer.invoke('todo:deleteTask', args),
  setChecklistItemChecked: (args) => ipcRenderer.invoke('todo:setChecklistItemChecked', args),
  deleteChecklistItem: (args) => ipcRenderer.invoke('todo:deleteChecklistItem', args),
  selectList: (args) => ipcRenderer.invoke('todo:selectList', args)
}
