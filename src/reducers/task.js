const taskReducer = (state, action) => {
    switch (action.type) {
        case 'APPENDTASK':
            {
                let tasks = state.tasks || [];
                tasks.push(action.task);
                return {
                    ...state,
                    tasks
                }
            }
        case 'SAVETASKS':
            {
                return {
                    ...state,
                    tasks: action.tasks
                }
            }
        case 'UPDATETASK':
            {
                let index;
                let tasks = state.tasks || [];
                let task = tasks.filter((t, i) => {
                    if (t.id === action.newTask.id) {
                        index = i;
                        return true;
                    }
                })[0];
                return {
                    ...state,
                    tasks: [
                        ...tasks.splice(0, index),
                        {
                            ...task,
                            status: action.newTask.status,
                            del: action.newTask.del
                        },
                        ...tasks.splice(index + 1)
                    ]
                }
            }
        case 'DELETETASK':
            {
                let index;
                let tasks = state.tasks || [];
                tasks.filter((t, i) => {
                    if (t.id === action.delTask.id) {
                        index = i;
                        return true;
                    }
                })[0];
                return {
                    ...state,
                    tasks: [
                        ...tasks.splice(0, index),
                        ...tasks.splice(index + 1)
                    ]
                }
            }
        default:
            return {
                ...state
            }
    }
}

export default taskReducer