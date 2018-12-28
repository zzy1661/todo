import { createStore, applyMiddleware, combineReducers, compose } from 'redux';
import thunk from 'redux-thunk';
import { connectRouter, routerMiddleware } from 'connected-react-router'
import { createBrowserHistory } from 'history'





import actions from '../actions'

const reducer = (state, action) => {
	if (!state) return {
		username: sessionStorage.getItem('username'),
		userToken: sessionStorage.getItem('userToken'),
		tasks:null
	}
	if(actions[action.type]) {
		return actions[action.type](state,action);
	} else {
		return state;
	}	
}

const createRootReducer = (history) => combineReducers({
    router: connectRouter(history),
    basic: reducer
  })
const history = createBrowserHistory()

const store = createStore(
  createRootReducer(history), // root reducer with router state
  compose(
    applyMiddleware(
      routerMiddleware(history),thunk
    ),
  ),
)

export default store;