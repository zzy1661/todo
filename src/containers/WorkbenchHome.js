import WorkbenchHome from '../components/WorkbenchHome';
import { connect } from 'react-redux';
import { getTasks, logout } from '../actions/commonActions';

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
        delTask: (task) => {
            return dispatch({
                type: 'DELETETASK',
                delTask: task
            })
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(WorkbenchHome)