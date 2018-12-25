import { connect } from 'react-redux';
import TodoPlan from '../components/TodoPlan';

const mapStateToProps = (state) => {
    return {
        username: state.username,
        userToken: state.userToken
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        removeUser: (username, userToken) => {          
            dispatch({ type: 'logout'});
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(TodoPlan)