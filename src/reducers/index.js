import { combineReducers } from 'redux'
import { connectRouter } from 'connected-react-router'
import taskReducer from './task'
import userReducer from './user'

const rootReducer = (history) => combineReducers({
  task: taskReducer,
  user: userReducer,
  router: connectRouter(history)
})

export default rootReducer
