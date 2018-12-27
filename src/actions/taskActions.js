export default {
    saveTasks(state, action) {
        return { ...state, tasks: action.tasks }
    },   
}