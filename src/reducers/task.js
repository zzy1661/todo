const taskReducer = (state, action) => {
  switch (action.type) {
    case 'SAVETASKS':
      return {...state, tasks: action.tasks}
    default:
      return {
        ...state
      }
  }
}

export default taskReducer
