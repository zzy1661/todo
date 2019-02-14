import { connect } from 'react-redux';
import EditTask from '../components/EditTask';
import {  logout } from '../actions/commonActions';

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
        delTask: (task) => {
            return dispatch({
                type: 'DELETETASK',
                delTask: task
            })
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(EditTask)