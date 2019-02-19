import React from 'react';
import { connect } from 'dva';
import TodoTasks from '../components/TodoTasks';

const TodoTasksPage = ({ dispatch, user}) => {


    return (
        <TodoTasks>
           
        </TodoTasks>
    )
}
  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(TodoTasksPage);