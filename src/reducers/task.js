const taskReducer = (state, action) => {
    switch (action.type) {
        case 'APPENDTASK':
            const tasks = state.tasks || [];
            tasks.push(action.task);
            return {
                ...state,
                tasks
            }
        case 'SAVETASKS':
            return {
                ...state,
                tasks: action.tasks
            }
        default:
            return {
                tasks: null,
            }
    }
}

export default taskReducer