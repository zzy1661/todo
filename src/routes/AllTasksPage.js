import React from 'react';
import { connect } from 'dva';
import AllTasks from '../components/AllTasks';

const AllTasksPage = ({ dispatch, user, taskList}) => {

    
    return (
        <AllTasks user={user} tasks={taskList}></AllTasks>
    )
}
  
  // export default Products;
  export default connect(({ user,tasks }) => {
      return {
            user,
            taskList: tasks.list
      }
  })(AllTasksPage);