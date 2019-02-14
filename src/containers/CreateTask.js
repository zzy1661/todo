import { connect } from 'react-redux';
import CreateTask from '../components/CreateTask';
import {  getTasks, logout } from '../actions/commonActions';

const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.user,
        ...state.task
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        removeUser: () => {
            dispatch(logout());
        },
        getTasks: (token) => { 
            return dispatch(getTasks(token));
       },
       saveTask: (task) => {
           return dispatch({type:'APPENDTASK',task})
       },
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(CreateTask)