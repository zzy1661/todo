const taskReducer = (state, action) => {
  switch (action.type) {
    case 'SAVETASKS':
      return {...state, tasks: action.tasks}
    default:
      return {
        tasks: null,
      }
  }
}

export default taskReducer
