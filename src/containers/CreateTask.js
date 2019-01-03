import { connect } from 'react-redux';
import CreateTask from '../components/CreateTask';
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
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(CreateTask)